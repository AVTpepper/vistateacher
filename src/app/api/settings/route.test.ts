// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "./route";
import { PrivateRecoveryError } from "@/lib/profiles/private-user";

const state = vi.hoisted(() => ({
  origin: true,
  account: { uid: "verified-owner", email: "verified@example.com" } as {
    uid: string;
    email: string;
  } | null,
  update: vi.fn(),
}));
vi.mock("@/lib/auth/request", () => ({ hasTrustedOrigin: () => state.origin }));
vi.mock("@/lib/auth/route-account", () => ({
  getRouteAccount: async () => state.account,
}));
vi.mock("@/lib/profiles/server", () => ({
  updatePrivateSettings: state.update,
}));
const settings = {
  contactDetails: { professionalEmail: "", phone: "" },
  privacySettings: {
    shareContactInfo: false,
    allowMessagesFromNonConnections: false,
  },
  notificationSettings: { email: false, inApp: false },
};
const request = (body: unknown = settings) =>
  new NextRequest("https://vista.test/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.origin = true;
  state.account = { uid: "verified-owner", email: "verified@example.com" };
  state.update.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

it("saves strict allowed fields with the authenticated uid and account email", async () => {
  const response = await PATCH(
    request({ ...settings, uid: "attacker", email: "attacker@example.com" }),
  );
  expect(response.status).toBe(200);
  expect(state.update).toHaveBeenCalledWith(
    "verified-owner",
    "verified@example.com",
    settings,
  );
});

it.each([
  ["deletion-blocked", 403],
  ["inactive", 403],
  ["profile-required", 409],
  ["recovery-required", 409],
  ["invalid-identity", 401],
] as const)(
  "returns %s as %s without pretending the save succeeded",
  async (code, status) => {
    state.update.mockRejectedValue(new PrivateRecoveryError(code));
    const response = await PATCH(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
  },
);

it("keeps malformed JSON and incomplete input out of storage", async () => {
  expect(
    (await PATCH(request({ email: "untrusted@example.com" }))).status,
  ).toBe(400);
  expect(state.update).not.toHaveBeenCalled();
});

it("requires origin and authentication before saving", async () => {
  state.origin = false;
  expect((await PATCH(request())).status).toBe(403);
  state.origin = true;
  state.account = null;
  expect((await PATCH(request())).status).toBe(401);
  expect(state.update).not.toHaveBeenCalled();
});

it("returns a retry response without exposing an unexpected private error", async () => {
  state.update.mockRejectedValue(new Error("PRIVATE_STORAGE_CONTENT"));
  const response = await PATCH(request());
  expect(response.status).toBe(503);
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "PRIVATE_STORAGE_CONTENT",
  );
});
