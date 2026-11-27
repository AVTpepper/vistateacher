// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProfileView } from "./server";
import { newPrivateUserData } from "./private-user";

const state = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  writes: [] as string[],
  privateReadError: null as Error | null,
  relationship: vi.fn(),
}));
vi.mock("@/lib/firebase/admin", () => {
  const reference = (path: string) => ({
    path,
    get: async () => {
      if (path.startsWith("userPrivate/") && state.privateReadError)
        throw state.privateReadError;
      return {
        exists: state.documents.has(path) || path.startsWith("profileViews/"),
        data: () => state.documents.get(path),
      };
    },
  });
  return {
    adminDb: () => ({
      doc: reference,
      runTransaction: async (
        callback: (transaction: unknown) => Promise<unknown>,
      ) =>
        callback({
          get: (ref: ReturnType<typeof reference>) => ref.get(),
          create: (ref: { path: string }) => state.writes.push(ref.path),
          set: (ref: { path: string }) => state.writes.push(ref.path),
        }),
    }),
  };
});
vi.mock("@/lib/billing/server", () => ({
  getBillingState: async () => ({ effectivePlan: "free" }),
}));
vi.mock("@/lib/network/server", () => ({
  resolveConnectionRelationship: state.relationship,
}));
vi.mock("@/lib/accounts/deletion", () => ({
  enqueueAccountDeletion: vi.fn(),
}));

beforeEach(() => {
  state.documents.clear();
  state.writes.length = 0;
  state.privateReadError = null;
  state.relationship.mockResolvedValue({ status: "accepted", direction: null });
  state.documents.set("users/owner", {
    uid: "owner",
    displayName: "Public Educator",
    professionalRoles: ["Educator"],
    gradeLevel: "Primary",
    subjects: ["Science"],
    languages: [],
    country: "",
    city: "",
    school: "",
    yearsOfExperience: null,
    bio: "A public biography that remains readable.",
    website: null,
    interests: [],
    photoURL: null,
    coverImageURL: null,
    role: "educator",
    isVerified: false,
    resourceCount: 0,
    postCount: 0,
    status: "active",
    createdAt: null,
    updatedAt: null,
  });
});

describe("public profile projection with unreadable private storage", () => {
  it.each([null, "owner", "connected-viewer"])(
    "keeps public information visible to %s without disclosing contacts, messaging or repairing private data",
    async (viewer) => {
      state.documents.set("userPrivate/owner", {
        email: "PRIVATE_LOGIN@example.com",
      });
      const view = await getProfileView("owner", viewer);
      expect(view?.profile.bio).toContain("public biography");
      expect(view?.profile.displayName).toBe("Public Educator");
      expect(view?.contactDetails).toBeNull();
      expect(view?.canMessage).toBe(false);
      expect(JSON.stringify(view)).not.toContain("PRIVATE_LOGIN");
      expect(
        state.writes.filter((path) => path.startsWith("userPrivate/")),
      ).toEqual([]);
    },
  );

  it("also tolerates a missing private document and invalid contact storage", async () => {
    expect(
      (await getProfileView("owner", "connected-viewer"))?.canMessage,
    ).toBe(false);
    state.documents.set("userPrivate/owner", {
      ...newPrivateUserData("login@example.com", null),
      contactDetails: { professionalEmail: "CORRUPT_CONTACT", phone: "" },
      privacySettings: {
        shareContactInfo: true,
        allowMessagesFromNonConnections: true,
      },
    });
    const view = await getProfileView("owner", "connected-viewer");
    expect(view?.contactDetails).toBeNull();
    expect(view?.canMessage).toBe(false);
    expect(JSON.stringify(view)).not.toContain("CORRUPT_CONTACT");
  });

  it("preserves accepted-connection messaging for valid private records with non-connection messaging off", async () => {
    state.documents.set(
      "userPrivate/owner",
      newPrivateUserData("login@example.com", null),
    );
    expect(
      (await getProfileView("owner", "connected-viewer"))?.canMessage,
    ).toBe(true);
    state.documents.set("blocks/owner_connected-viewer", {});
    expect(
      (await getProfileView("owner", "connected-viewer"))?.canMessage,
    ).toBe(false);
  });

  it("retains explicit public contact sharing for a valid private record", async () => {
    const privateUser = newPrivateUserData("login@example.com", null);
    privateUser.privacySettings.shareContactInfo = true;
    privateUser.contactDetails.professionalEmail = "public@school.test";
    state.documents.set("userPrivate/owner", privateUser);
    expect((await getProfileView("owner", null))?.contactDetails).toEqual({
      professionalEmail: "public@school.test",
      phone: "",
    });
  });

  it("propagates a failed database read rather than interpreting it as invalid storage", async () => {
    state.privateReadError = new Error("Read unavailable");
    await expect(getProfileView("owner", null)).rejects.toThrow(
      "Read unavailable",
    );
  });
});
