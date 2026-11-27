// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/policy";
import {
  educationStageValues,
  professionalRoles,
  subjectAreas,
} from "@/lib/profiles/options";
import { newPrivateUserData } from "@/lib/profiles/private-user";

const state = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  reads: [] as string[][],
  writes: [] as { path: string; data: Record<string, unknown> }[],
  account: {
    uid: "verified-owner",
    email: "verified-login@example.com",
    status: null,
    photoURL: null,
  } as { uid: string; email: string; status: string | null; photoURL: null },
}));
vi.mock("@/lib/auth/request", () => ({ hasTrustedOrigin: () => true }));
vi.mock("@/lib/auth/session", () => ({
  verifySessionCookie: async () => state.account,
}));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    doc: (path: string) => ({ path }),
    runTransaction: async (
      callback: (transaction: unknown) => Promise<unknown>,
    ) => {
      let writeStarted = false;
      const staged: typeof state.writes = [];
      const write = (ref: { path: string }, data: Record<string, unknown>) => {
        writeStarted = true;
        staged.push({ path: ref.path, data });
      };
      const result = await callback({
        getAll: async (...references: { path: string }[]) => {
          if (writeStarted) throw new Error("Read after write");
          state.reads.push(references.map((reference) => reference.path));
          return references.map((reference) => ({
            exists: state.documents.has(reference.path),
            data: () => state.documents.get(reference.path),
          }));
        },
        set: write,
        create: write,
        update: write,
      });
      state.writes.push(...staged);
      return result;
    },
  }),
}));
const request = () =>
  new NextRequest("https://vista.test/api/onboarding", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE_NAME}=verified-session`,
    },
    body: JSON.stringify({
      displayName: "New Educator",
      professionalRoles: [professionalRoles[0]],
      gradeLevel: educationStageValues[0],
      subjects: [subjectAreas.find((value) => value !== "Languages")],
    }),
  });
beforeEach(() => {
  state.documents.clear();
  state.reads.length = 0;
  state.writes.length = 0;
  state.account.status = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

it("reads the deletion job before atomically initializing complete new-account records", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(state.reads).toEqual([
    [
      "users/verified-owner",
      "userPrivate/verified-owner",
      "subscriptions/verified-owner",
      "accountDeletions/verified-owner",
    ],
  ]);
  expect(state.writes.map((write) => write.path)).toEqual([
    "users/verified-owner",
    "userPrivate/verified-owner",
    "subscriptions/verified-owner",
  ]);
  expect(state.writes[1].data).toMatchObject({
    email: "verified-login@example.com",
    contactDetails: { professionalEmail: "", phone: "" },
    privacySettings: {
      shareContactInfo: false,
      allowMessagesFromNonConnections: false,
    },
  });
});

it("repairs repeated onboarding without replacing public data, subscription or valid private choices", async () => {
  state.documents.set("users/verified-owner", { status: "active" });
  state.documents.set("subscriptions/verified-owner", { plan: "plus" });
  state.documents.set("userPrivate/verified-owner", {
    email: "old@example.com",
    notificationSettings: { email: false, inApp: false },
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].path).toBe("userPrivate/verified-owner");
  expect(state.writes[0].data).toMatchObject({
    email: "verified-login@example.com",
    "privacySettings.shareContactInfo": false,
  });
  expect(state.writes[0].data).not.toHaveProperty("notificationSettings.inApp");
});

it.each(["failed", "complete", "pending"])(
  "refuses onboarding through an existing %s deletion job even after public/private cleanup",
  async (status) => {
    state.documents.set("accountDeletions/verified-owner", { status });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "deletion-blocked" });
    expect(state.writes).toEqual([]);
  },
);

it("rechecks inactive status inside the transaction despite a stale session", async () => {
  state.account.status = "active";
  state.documents.set("users/verified-owner", { status: "suspended" });
  expect((await POST(request())).status).toBe(403);
  expect(state.writes).toEqual([]);
});

it("keeps unsupported private corruption read-only without partial onboarding writes", async () => {
  state.documents.set("userPrivate/verified-owner", {
    ...newPrivateUserData("verified-login@example.com", null),
    contactDetails: "PRIVATE_CORRUPT_CONTACT",
  });
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "recovery-required" });
  expect(state.writes).toEqual([]);
});
