import { randomUUID } from "node:crypto";
import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { adminDb } from "@/lib/firebase/admin";
import {
  newPrivateUserData,
  recoverPrivateUser,
  savePrivateSettings,
} from "@/lib/profiles/private-user";

const paths = new Set<string>();
const pendingMutations = new Set<Promise<void>>();
const email = "verified-account@example.com";
const oldTime = Timestamp.fromMillis(1_000);
const reference = (path: string) => {
  paths.add(path);
  return adminDb().doc(path);
};
async function owner(raw?: Record<string, unknown>) {
  const uid = `private-recovery-${randomUUID()}`;
  const profile = reference(`users/${uid}`);
  const privateUser = reference(`userPrivate/${uid}`);
  const job = reference(`accountDeletions/${uid}`);
  await profile.set({ status: "active" });
  if (raw) await privateUser.set(raw);
  return { uid, profile, privateUser, job };
}

beforeAll(() => {
  if (
    process.env.GCLOUD_PROJECT !== "demo-vista-teacher" ||
    !/^(127\.0\.0\.1|localhost):\d+$/.test(
      process.env.FIRESTORE_EMULATOR_HOST ?? "",
    )
  )
    throw new Error(
      "Private-profile integration requires the local demo Firestore emulator.",
    );
});
afterEach(async () => {
  try {
    await Promise.all(pendingMutations);
  } finally {
    vi.restoreAllMocks();
    const batch = adminDb().batch();
    for (const path of paths) batch.delete(adminDb().doc(path));
    await batch.commit();
    paths.clear();
    pendingMutations.clear();
  }
});

/**
 * Inject ABORTED after real transaction reads and staged writes. Firestore must
 * roll those writes back and retry. A competing real batch can then commit
 * while the first attempt's locks are released, before the next attempt reads.
 * This tests actual rollback/retry and stored fields, rather than a mock merge.
 */
function retryAfterConcurrentWrite(mutate: () => Promise<unknown>) {
  const db = adminDb();
  const original = db.runTransaction.bind(db);
  let mutation: Promise<void> | undefined;
  let mutationError: unknown;
  const attempts = vi.fn();
  vi.spyOn(db, "runTransaction").mockImplementation(
    <T>(callback: (transaction: Transaction) => Promise<T>) =>
      original(async (transaction) => {
        attempts();
        if (mutation) {
          await mutation;
          if (mutationError) throw mutationError;
        }
        const result = await callback(transaction);
        if (!mutation) {
          mutation = Promise.resolve()
            .then(mutate)
            .then(() => undefined)
            .catch((error: unknown) => {
              mutationError = error;
            });
          pendingMutations.add(mutation);
          throw Object.assign(new Error("Injected transaction conflict"), {
            code: 10,
          });
        }
        return result;
      }),
  );
  return attempts;
}

describe("private-profile recovery against real Firestore", () => {
  it("recovers email-only storage with actual nested updates and never publishes the login email as contact", async () => {
    const account = await owner({
      email: "legacy-login@example.com",
      contactDetails: { extension: "retain" },
      privacySettings: { shareContactInfo: false, unknownPrivacy: "retain" },
      notificationSettings: { email: false, inApp: "false", digest: "retain" },
      accountDeletion: { requestedAt: null, audit: "retain" },
      createdAt: oldTime,
      unknownTop: { source: "retain" },
    });
    expect(await recoverPrivateUser(account.uid, email)).toMatchObject({
      state: "ready",
      repaired: true,
      user: {
        contactDetails: { professionalEmail: "", phone: "" },
        notificationSettings: { email: false, inApp: false },
      },
    });
    const stored = (await account.privateUser.get()).data()!;
    expect(stored).toMatchObject({
      email,
      contactDetails: { professionalEmail: "", phone: "", extension: "retain" },
      privacySettings: {
        shareContactInfo: false,
        allowMessagesFromNonConnections: false,
        unknownPrivacy: "retain",
      },
      notificationSettings: { email: false, inApp: false, digest: "retain" },
      accountDeletion: { requestedAt: null, audit: "retain" },
      unknownTop: { source: "retain" },
    });
    expect(stored.createdAt.isEqual(oldTime)).toBe(true);
    expect(stored.updatedAt).toBeInstanceOf(Timestamp);
  });

  it("creates complete missing settings once and leaves a second recovery unchanged", async () => {
    const account = await owner();
    expect(await recoverPrivateUser(account.uid, email)).toMatchObject({
      state: "ready",
      repaired: true,
    });
    const first = (await account.privateUser.get()).data();
    expect(first).toMatchObject({
      email,
      contactDetails: { professionalEmail: "", phone: "" },
      privacySettings: {
        shareContactInfo: false,
        allowMessagesFromNonConnections: false,
      },
      notificationSettings: { email: true, inApp: true },
      accountDeletion: { requestedAt: null },
    });
    expect(await recoverPrivateUser(account.uid, email)).toMatchObject({
      state: "ready",
      repaired: false,
    });
    expect((await account.privateUser.get()).data()).toEqual(first);
  });

  it("keeps a valid unchanged opt-out record and its updatedAt untouched", async () => {
    const settings = newPrivateUserData(email, oldTime);
    settings.notificationSettings = { email: false, inApp: false };
    const account = await owner(settings);
    expect(await recoverPrivateUser(account.uid, email)).toMatchObject({
      state: "ready",
      repaired: false,
    });
    expect((await account.privateUser.get()).data()).toEqual(settings);
  });

  it("allows concurrent missing-record recoveries without duplicate records or lost fields", async () => {
    const account = await owner();
    const results = await Promise.all([
      recoverPrivateUser(account.uid, email),
      recoverPrivateUser(account.uid, email),
      recoverPrivateUser(account.uid, email),
    ]);
    expect(results.every((result) => result.state === "ready")).toBe(true);
    expect((await account.privateUser.get()).data()).toMatchObject({
      email,
      notificationSettings: { email: true, inApp: true },
      contactDetails: { professionalEmail: "", phone: "" },
    });
  });

  it("rereads and preserves a newer explicit opt-out after Firestore rolls back a repair attempt", async () => {
    const account = await owner({ email, createdAt: oldTime });
    const attempts = retryAfterConcurrentWrite(() =>
      account.privateUser.update({
        "notificationSettings.inApp": false,
        "privacySettings.shareContactInfo": true,
        "privacySettings.newPreference": "retain",
      }),
    );
    expect(await recoverPrivateUser(account.uid, email)).toMatchObject({
      state: "ready",
      user: {
        notificationSettings: { inApp: false },
        privacySettings: { shareContactInfo: true },
      },
    });
    expect(attempts.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect((await account.privateUser.get()).data()).toMatchObject({
      notificationSettings: { inApp: false, email: true },
      privacySettings: { shareContactInfo: true, newPreference: "retain" },
    });
  });

  it("refuses repair after a competing deletion enqueue wins the retry", async () => {
    const account = await owner({ email, createdAt: oldTime });
    const marker = Timestamp.fromMillis(2_000);
    const attempts = retryAfterConcurrentWrite(async () => {
      const batch = adminDb().batch();
      batch.set(account.job, { status: "pending", requestedAt: marker });
      batch.update(account.privateUser, {
        "accountDeletion.requestedAt": marker,
      });
      await batch.commit();
    });
    await expect(recoverPrivateUser(account.uid, email)).rejects.toMatchObject({
      code: "deletion-blocked",
    });
    expect(attempts.mock.calls.length).toBeGreaterThanOrEqual(2);
    const stored = (await account.privateUser.get()).data()!;
    expect(stored.accountDeletion.requestedAt.isEqual(marker)).toBe(true);
    expect(stored).not.toHaveProperty("contactDetails");
    expect((await account.job.get()).data()?.status).toBe("pending");
  });

  it("never recreates public/private data after cleanup wins a retried recovery", async () => {
    const account = await owner({ email });
    const attempts = retryAfterConcurrentWrite(async () => {
      const batch = adminDb().batch();
      batch.delete(account.profile);
      batch.delete(account.privateUser);
      batch.set(account.job, { status: "complete" });
      await batch.commit();
    });
    await expect(recoverPrivateUser(account.uid, email)).rejects.toMatchObject({
      code: "deletion-blocked",
    });
    expect(attempts.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect((await account.profile.get()).exists).toBe(false);
    expect((await account.privateUser.get()).exists).toBe(false);
    expect((await account.job.get()).data()?.status).toBe("complete");
  });

  it.each(["pending", "processing", "failed", "complete", "unknown"])(
    "blocks an existing %s deletion job even with no private document",
    async (status) => {
      const account = await owner();
      await account.job.set({ status });
      await expect(
        recoverPrivateUser(account.uid, email),
      ).rejects.toMatchObject({
        code: "deletion-blocked",
      });
      await expect(
        savePrivateSettings(
          account.uid,
          email,
          newPrivateUserData(email, oldTime),
        ),
      ).rejects.toMatchObject({ code: "deletion-blocked" });
      expect((await account.privateUser.get()).exists).toBe(false);
    },
  );

  it.each([false, 0, "", "uncertain", { unknownMarker: true }])(
    "retains non-null deletion marker %j and refuses owner writes",
    async (marker) => {
      const raw = {
        ...newPrivateUserData(email, oldTime),
        accountDeletion: { requestedAt: marker, audit: "retain" },
      };
      const account = await owner(raw);
      await expect(
        recoverPrivateUser(account.uid, email),
      ).rejects.toMatchObject({
        code: "deletion-blocked",
      });
      await expect(
        savePrivateSettings(
          account.uid,
          email,
          newPrivateUserData(email, oldTime),
        ),
      ).rejects.toMatchObject({ code: "deletion-blocked" });
      expect((await account.privateUser.get()).data()).toEqual(raw);
    },
  );

  it("writes explicit settings as nested leaves while retaining unrelated metadata and trusted identity", async () => {
    const raw = {
      ...newPrivateUserData(email, oldTime),
      contactDetails: {
        professionalEmail: "school@example.com",
        phone: "123",
        extension: "42",
      },
      privacySettings: {
        shareContactInfo: false,
        allowMessagesFromNonConnections: false,
        unknownPrivacy: "retain",
      },
      notificationSettings: { email: false, inApp: false, digest: "retain" },
      accountDeletion: { requestedAt: null, audit: "retain" },
      unknownTop: "retain",
    };
    const account = await owner(raw);
    const input = {
      ...newPrivateUserData("untrusted-body@example.com", oldTime),
      contactDetails: {
        professionalEmail: "new-school@example.com",
        phone: "456",
      },
      notificationSettings: { email: false, inApp: false },
    };
    await savePrivateSettings(account.uid, email, input);
    const stored = (await account.privateUser.get()).data()!;
    expect(stored).toMatchObject({
      email,
      contactDetails: {
        professionalEmail: "new-school@example.com",
        phone: "456",
        extension: "42",
      },
      privacySettings: { unknownPrivacy: "retain" },
      notificationSettings: { email: false, inApp: false, digest: "retain" },
      accountDeletion: { requestedAt: null, audit: "retain" },
      unknownTop: "retain",
    });
    expect(stored.createdAt.isEqual(oldTime)).toBe(true);
    expect(stored.updatedAt).toBeInstanceOf(Timestamp);
  });

  it.each([
    {
      contactDetails: {
        professionalEmail: "INVALID_PRIVATE_CONTACT",
        phone: "",
      },
    },
    { privacySettings: "PRIVATE_NON_MAP_SETTINGS" },
  ])(
    "keeps unsupported corruption raw and rejects forged valid-looking settings: %j",
    async (overrides) => {
      const raw = { ...newPrivateUserData(email, oldTime), ...overrides };
      const account = await owner(raw);
      expect(
        await recoverPrivateUser(account.uid, "new-verified@example.com"),
      ).toMatchObject({
        state: "recovery-required",
      });
      await expect(
        savePrivateSettings(
          account.uid,
          email,
          newPrivateUserData(email, oldTime),
        ),
      ).rejects.toMatchObject({ code: "recovery-required" });
      expect((await account.privateUser.get()).data()).toEqual(raw);
    },
  );

  it("does not create orphan private settings for a missing or inactive public user", async () => {
    const account = await owner();
    await account.profile.delete();
    expect(
      await recoverPrivateUser(account.uid, email, {
        allowMissingProfile: true,
      }),
    ).toEqual({ state: "onboarding-required" });
    await expect(recoverPrivateUser(account.uid, email)).rejects.toMatchObject({
      code: "profile-required",
    });
    await account.profile.set({ status: "suspended" });
    await expect(recoverPrivateUser(account.uid, email)).rejects.toMatchObject({
      code: "inactive",
    });
    expect((await account.privateUser.get()).exists).toBe(false);
  });
});
