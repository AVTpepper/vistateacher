// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertNoDeletionEvidence,
  newPrivateUserData,
  planPrivateUserRepair,
  recoverPrivateUser,
  savePrivateSettings,
} from "./private-user";

type Data = Record<string, unknown>;
const state = vi.hoisted(() => ({
  documents: new Map<string, Data>(),
  reads: [] as string[][],
  writes: [] as { operation: string; path: string; data: Data }[],
  transaction: vi.fn(),
}));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    doc: (path: string) => ({ path }),
    runTransaction: state.transaction,
  }),
}));
const active = { profile: "active", deletionJobExists: false } as const;
const email = "account-login@vista.local";
const oldTime = { seconds: 1, nanoseconds: 0 };
const now = { seconds: 2, nanoseconds: 0 };
const defaults = () => newPrivateUserData(email, oldTime);

beforeEach(() => {
  state.documents.clear();
  state.reads.length = 0;
  state.writes.length = 0;
  state.transaction.mockImplementation(async (callback) => {
    let writeStarted = false;
    const write = (operation: string, ref: { path: string }, data: Data) => {
      writeStarted = true;
      state.writes.push({ operation, path: ref.path, data });
    };
    return callback({
      getAll: async (...refs: { path: string }[]) => {
        if (writeStarted) throw new Error("Read after write");
        state.reads.push(refs.map((ref) => ref.path));
        return refs.map((ref) => ({
          exists: state.documents.has(ref.path),
          data: () => state.documents.get(ref.path),
        }));
      },
      create: (ref: { path: string }, data: Data) => write("create", ref, data),
      update: (ref: { path: string }, data: Data) => write("update", ref, data),
    });
  });
});

describe("private document normalization and preservation", () => {
  it("builds all nested defaults without exposing the login email as contact", () => {
    const data = defaults();
    expect(data).toMatchObject({
      email,
      contactDetails: { professionalEmail: "", phone: "" },
      privacySettings: {
        shareContactInfo: false,
        allowMessagesFromNonConnections: false,
      },
      notificationSettings: { email: true, inApp: true },
      accountDeletion: { requestedAt: null },
      createdAt: oldTime,
      updatedAt: oldTime,
    });
  });

  it("creates a complete missing record and repairs the known email-only legacy record", () => {
    expect(planPrivateUserRepair(undefined, email, active, now)).toMatchObject({
      state: "ready",
      repaired: true,
      write: { kind: "create" },
    });
    const raw = { email, migrationTag: "retain" };
    const result = planPrivateUserRepair(raw, email, active, now);
    expect(result).toMatchObject({
      state: "ready",
      user: { contactDetails: { professionalEmail: "", phone: "" } },
      write: {
        kind: "update",
        fields: {
          "contactDetails.professionalEmail": "",
          "privacySettings.allowMessagesFromNonConnections": false,
          "notificationSettings.inApp": true,
        },
      },
    });
    expect(raw).toEqual({ email, migrationTag: "retain" });
  });

  it("is a no-op for a complete valid unchanged document, including opt-outs", () => {
    const raw = defaults();
    raw.notificationSettings = { email: false, inApp: false };
    expect(planPrivateUserRepair(raw, email, active, now)).toMatchObject({
      state: "ready",
      repaired: false,
      write: null,
      user: { notificationSettings: { email: false, inApp: false } },
    });
  });

  it("patches only absent leaves while retaining contacts, consent, timestamps and unknown fields", () => {
    const raw = {
      ...defaults(),
      contactDetails: {
        professionalEmail: "teacher@school.test",
        phone: "123",
        extension: "42",
      },
      privacySettings: { shareContactInfo: true, customPrivacy: false },
      notificationSettings: { email: false, digest: false },
      accountDeletion: { requestedAt: null, auditNote: "keep" },
      auditTag: "keep",
    };
    const result = planPrivateUserRepair(raw, email, active, now);
    expect(result).toMatchObject({
      state: "ready",
      user: {
        contactDetails: {
          professionalEmail: "teacher@school.test",
          phone: "123",
        },
        privacySettings: {
          shareContactInfo: true,
          allowMessagesFromNonConnections: false,
        },
        notificationSettings: { email: false, inApp: true },
        createdAt: oldTime,
      },
      write: {
        kind: "update",
        fields: {
          "privacySettings.allowMessagesFromNonConnections": false,
          "notificationSettings.inApp": true,
          updatedAt: now,
        },
      },
    });
    if (result.write?.kind !== "update") throw new Error("Expected update");
    expect(Object.keys(result.write.fields)).toHaveLength(3);
    expect(result.write.fields).not.toHaveProperty("accountDeletion");
    expect(result.write.fields).not.toHaveProperty("createdAt");
    expect(raw.accountDeletion.auditNote).toBe("keep");
  });

  it.each([false, true])(
    "preserves literal %s privacy and notification choices",
    (value) => {
      const raw = defaults();
      raw.privacySettings = {
        shareContactInfo: value,
        allowMessagesFromNonConnections: value,
      };
      raw.notificationSettings = { email: value, inApp: value };
      const result = planPrivateUserRepair(raw, email, active, now);
      expect(result).toMatchObject({
        state: "ready",
        repaired: false,
        write: null,
        user: {
          privacySettings: raw.privacySettings,
          notificationSettings: raw.notificationSettings,
        },
      });
    },
  );

  it.each(["false", "true", 0, 1, null, [], {}])(
    "keeps malformed present notification value %j suppressed",
    (value) => {
      const raw = {
        ...defaults(),
        notificationSettings: { email: false, inApp: value },
        privacySettings: {
          shareContactInfo: "false",
          allowMessagesFromNonConnections: "true",
        },
      };
      const result = planPrivateUserRepair(raw, email, active, now);
      expect(result).toMatchObject({
        state: "ready",
        user: {
          notificationSettings: { email: false, inApp: false },
          privacySettings: {
            shareContactInfo: false,
            allowMessagesFromNonConnections: false,
          },
        },
        write: { fields: { "notificationSettings.inApp": false } },
      });
    },
  );

  it("updates only the verified primary email and update timestamp on identity changes", () => {
    const raw = {
      ...defaults(),
      contactDetails: {
        professionalEmail: "professional@school.test",
        phone: "123",
      },
    };
    const result = planPrivateUserRepair(
      raw,
      "changed-login@vista.local",
      active,
      now,
    );
    expect(result.write).toEqual({
      kind: "update",
      fields: { email: "changed-login@vista.local", updatedAt: now },
    });
    expect(result).toMatchObject({
      state: "ready",
      user: { contactDetails: raw.contactDetails, createdAt: oldTime },
    });
  });

  it.each([
    {
      contactDetails: {
        professionalEmail: "invalid nonempty address",
        phone: "123",
      },
    },
    { contactDetails: { professionalEmail: {}, phone: "123" } },
    { contactDetails: { professionalEmail: "", phone: "a".repeat(31) } },
    { contactDetails: null },
    { privacySettings: "false" },
    { notificationSettings: false },
  ])(
    "keeps unsupported corruption raw and returns a read-only safe owner state: %j",
    (overrides) => {
      const raw = { ...defaults(), ...overrides };
      const before = structuredClone(raw);
      const result = planPrivateUserRepair(raw, email, active, now);
      expect(result).toMatchObject({ state: "recovery-required", write: null });
      if (result.state !== "recovery-required")
        throw new Error("Expected review");
      expect(result.issues.length).toBeGreaterThan(0);
      expect(typeof result.safeSettings.contactDetails.professionalEmail).toBe(
        "string",
      );
      expect(raw).toEqual(before);
    },
  );

  it("does not fabricate a creation timestamp when one already exists", () => {
    const raw = { ...defaults(), createdAt: "legacy creation evidence" };
    const result = planPrivateUserRepair(raw, email, active, now);
    expect(result).toMatchObject({
      state: "ready",
      user: { createdAt: raw.createdAt },
      write: null,
    });
  });
});

describe("deletion and transaction boundaries", () => {
  it.each([false, 0, "", "unknown", now, [], {}])(
    "preserves every non-null deletion marker %j",
    (marker) => {
      const raw = {
        ...defaults(),
        accountDeletion: { requestedAt: marker, history: "retain" },
      };
      expect(() => planPrivateUserRepair(raw, email, active, now)).toThrow(
        expect.objectContaining({ code: "deletion-blocked" }),
      );
      expect(raw.accountDeletion.requestedAt).toEqual(marker);
    },
  );

  it.each([null, false, {}, "pending", { requestedAt: undefined }])(
    "blocks uncertain deletion metadata %j",
    (accountDeletion) => {
      expect(() =>
        assertNoDeletionEvidence({ accountDeletion }, false),
      ).toThrow(expect.objectContaining({ code: "deletion-blocked" }));
    },
  );

  it.each(["pending", "processing", "failed", "complete", "unknown"])(
    "blocks any existing %s deletion job before a write",
    async (status) => {
      state.documents.set("users/owner", { status: "active" });
      state.documents.set("accountDeletions/owner", { status });
      await expect(recoverPrivateUser("owner", email)).rejects.toMatchObject({
        code: "deletion-blocked",
      });
      expect(state.writes).toEqual([]);
    },
  );

  it("reads public/private/job together before creating a missing private document", async () => {
    state.documents.set("users/owner", { status: "active" });
    expect(await recoverPrivateUser("owner", email)).toMatchObject({
      state: "ready",
    });
    expect(state.reads).toEqual([
      ["users/owner", "userPrivate/owner", "accountDeletions/owner"],
    ]);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toMatchObject({
      operation: "create",
      path: "userPrivate/owner",
      data: {
        email,
        contactDetails: { professionalEmail: "", phone: "" },
      },
    });
  });

  it("routes a genuinely new account to onboarding without any orphan private write", async () => {
    expect(
      await recoverPrivateUser("owner", email, { allowMissingProfile: true }),
    ).toEqual({ state: "onboarding-required" });
    expect(state.writes).toEqual([]);
    await expect(recoverPrivateUser("owner", email)).rejects.toMatchObject({
      code: "profile-required",
    });
  });

  it("rejects an invalid server identity even when the account still needs onboarding", async () => {
    await expect(
      recoverPrivateUser("owner", "invalid email", {
        allowMissingProfile: true,
      }),
    ).rejects.toMatchObject({ code: "invalid-identity" });
    expect(state.reads).toEqual([]);
    expect(state.writes).toEqual([]);
  });

  it.each(["suspended", "deleted", "unknown"])(
    "never repairs an existing %s public account",
    async (status) => {
      state.documents.set("users/owner", { status });
      await expect(recoverPrivateUser("owner", email)).rejects.toMatchObject({
        code: "inactive",
      });
      expect(state.writes).toEqual([]);
    },
  );

  it("uses allowed nested settings leaves without replacing unknown sibling data", async () => {
    state.documents.set("users/owner", { status: "active" });
    state.documents.set("userPrivate/owner", {
      ...defaults(),
      privacySettings: {
        ...defaults().privacySettings,
        unknownPrivacy: "retain",
      },
      accountDeletion: { requestedAt: null, audit: "retain" },
      unknownTop: "retain",
    });
    const settings = defaults();
    settings.privacySettings.allowMessagesFromNonConnections = true;
    await savePrivateSettings("owner", email, settings);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toMatchObject({
      operation: "update",
      data: {
        "privacySettings.allowMessagesFromNonConnections": true,
      },
    });
    expect(Object.keys(state.writes[0].data).sort()).toEqual([
      "privacySettings.allowMessagesFromNonConnections",
      "updatedAt",
    ]);
  });

  it("rejects a valid-looking settings PATCH during unsupported recovery instead of erasing raw contact data", async () => {
    state.documents.set("users/owner", { status: "active" });
    state.documents.set("userPrivate/owner", {
      ...defaults(),
      contactDetails: { professionalEmail: "bad stored value", phone: "" },
    });
    await expect(
      savePrivateSettings("owner", email, defaults()),
    ).rejects.toMatchObject({ code: "recovery-required" });
    expect(state.writes).toEqual([]);
  });
});
