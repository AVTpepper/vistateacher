import "server-only";

import {
  FieldValue,
  type DocumentReference,
  type Transaction,
} from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
  privateSettingsSchema,
  privateUserDocumentSchema,
  type PrivateSettings,
  type PrivateUserDocument,
} from "@/schemas/profile";

type Data = Record<string, unknown>;
type SettingsParent = keyof PrivateSettings;
export type RecoveryIssue =
  SettingsParent | "contactDetails.professionalEmail" | "contactDetails.phone";
export type PrivateRecoveryCode =
  | "profile-required"
  | "inactive"
  | "deletion-blocked"
  | "recovery-required"
  | "invalid-identity";

export class PrivateRecoveryError extends Error {
  constructor(readonly code: PrivateRecoveryCode) {
    const messages: Record<PrivateRecoveryCode, string> = {
      "profile-required": "Finish setting up your educator profile first.",
      inactive: "This account is unavailable.",
      "deletion-blocked":
        "Your account deletion needs review before settings can change.",
      "recovery-required":
        "Some saved settings need review. Your contact details remain hidden.",
      "invalid-identity":
        "Your account email could not be verified. Sign in again.",
    };
    super(messages[code]);
    this.name = "PrivateRecoveryError";
  }
}

export type PrivateOwnerState =
  | { state: "ready"; user: PrivateUserDocument; repaired: boolean }
  | {
      state: "recovery-required";
      safeSettings: PrivateSettings;
      issues: RecoveryIssue[];
    };
type WritePlan =
  { kind: "create"; data: Data } | { kind: "update"; fields: Data } | null;
export type PrivateRepairPlan = PrivateOwnerState & { write: WritePlan };

const has = (data: Data, key: string) =>
  Object.prototype.hasOwnProperty.call(data, key);
const map = (value: unknown): value is Data =>
  typeof value === "object" &&
  value !== null &&
  Object.getPrototypeOf(value) === Object.prototype;

function trustedEmail(value: string): string {
  const parsed = privateUserDocumentSchema.shape.email.safeParse(value);
  if (!parsed.success) throw new PrivateRecoveryError("invalid-identity");
  return parsed.data;
}

/** Trusted server identity only. Never use this email as professional contact. */
export function newPrivateUserData(
  verifiedEmail: string,
  now: unknown = FieldValue.serverTimestamp(),
): PrivateUserDocument {
  return {
    email: trustedEmail(verifiedEmail),
    contactDetails: { professionalEmail: "", phone: "" },
    privacySettings: {
      shareContactInfo: false,
      allowMessagesFromNonConnections: false,
    },
    notificationSettings: { email: true, inApp: true },
    accountDeletion: { requestedAt: null },
    createdAt: now,
    updatedAt: now,
  };
}

/** Read the durable job even when the public user is still active. */
export function assertNoDeletionEvidence(
  raw: Data | undefined,
  deletionJobExists: boolean,
): void {
  if (deletionJobExists) throw new PrivateRecoveryError("deletion-blocked");
  if (!raw || !has(raw, "accountDeletion")) return;
  const deletion = raw.accountDeletion;
  // Property presence matters: false, zero, empty strings and unknown values
  // are never interpreted as an absent deletion request.
  if (
    !map(deletion) ||
    !has(deletion, "requestedAt") ||
    deletion.requestedAt !== null
  )
    throw new PrivateRecoveryError("deletion-blocked");
  // Unknown deletion metadata is left intact; no existing accountDeletion map
  // is included in any repair or settings-save update below.
}

/** Pure storage planner. Neither authenticates nor reads/writes any database. */
export function planPrivateUserRepair(
  raw: Data | undefined,
  verifiedEmail: string,
  context: {
    profile: "active" | "new" | "missing" | "inactive";
    deletionJobExists: boolean;
  },
  now: unknown,
): PrivateRepairPlan {
  assertNoDeletionEvidence(raw, context.deletionJobExists);
  if (context.profile === "missing")
    throw new PrivateRecoveryError("profile-required");
  if (context.profile === "inactive")
    throw new PrivateRecoveryError("inactive");
  const defaults = newPrivateUserData(verifiedEmail, now);
  if (!raw)
    return {
      state: "ready",
      user: defaults,
      repaired: true,
      write: { kind: "create", data: defaults },
    };

  const fields: Data = {};
  const issues: RecoveryIssue[] = [];
  function parent(name: SettingsParent): Data {
    if (!has(raw!, name)) return {};
    const stored = raw![name];
    if (map(stored)) return stored;
    issues.push(name);
    return {};
  }
  const contact = parent("contactDetails");
  const privacy = parent("privacySettings");
  const notifications = parent("notificationSettings");
  const contactSchema = privateSettingsSchema.shape.contactDetails.shape;
  const safeContact = { professionalEmail: "", phone: "" };
  for (const key of ["professionalEmail", "phone"] as const) {
    if (!has(contact, key)) fields[`contactDetails.${key}`] = "";
    else {
      const result = contactSchema[key].safeParse(contact[key]);
      if (result.success) safeContact[key] = result.data;
      else issues.push(`contactDetails.${key}`);
    }
  }
  function preference(
    stored: Data,
    parentName: "privacySettings" | "notificationSettings",
    key: string,
    absentDefault: boolean,
  ): boolean {
    const value = stored[key];
    if (typeof value === "boolean") return value;
    const normalized = has(stored, key) ? false : absentDefault;
    fields[`${parentName}.${key}`] = normalized;
    return normalized;
  }
  const safeSettings: PrivateSettings = {
    contactDetails: safeContact,
    privacySettings: {
      shareContactInfo: preference(
        privacy,
        "privacySettings",
        "shareContactInfo",
        false,
      ),
      allowMessagesFromNonConnections: preference(
        privacy,
        "privacySettings",
        "allowMessagesFromNonConnections",
        false,
      ),
    },
    notificationSettings: {
      email: preference(
        notifications,
        "notificationSettings",
        "email",
        !has(raw, "notificationSettings") || map(raw.notificationSettings),
      ),
      inApp: preference(
        notifications,
        "notificationSettings",
        "inApp",
        !has(raw, "notificationSettings") || map(raw.notificationSettings),
      ),
    },
  };
  if (issues.length)
    return {
      state: "recovery-required",
      safeSettings,
      issues: [...new Set(issues)],
      write: null,
    };

  if (raw.email !== defaults.email) fields.email = defaults.email;
  if (!has(raw, "accountDeletion"))
    fields.accountDeletion = defaults.accountDeletion;
  if (!has(raw, "createdAt")) fields.createdAt = now;
  if (!has(raw, "updatedAt")) fields.updatedAt = now;
  if (Object.keys(fields).length) fields.updatedAt = now;
  const user = privateUserDocumentSchema.parse({
    ...safeSettings,
    email: defaults.email,
    accountDeletion: raw.accountDeletion ?? defaults.accountDeletion,
    createdAt: has(raw, "createdAt") ? raw.createdAt : now,
    updatedAt: Object.keys(fields).length ? now : raw.updatedAt,
  });
  return {
    state: "ready",
    user,
    repaired: Object.keys(fields).length > 0,
    write: Object.keys(fields).length ? { kind: "update", fields } : null,
  };
}

/** All reads have already finished before this helper is called. */
export function applyPrivateUserPlan(
  transaction: Transaction,
  reference: DocumentReference,
  plan: PrivateRepairPlan,
): void {
  if (plan.write?.kind === "create")
    transaction.create(reference, plan.write.data);
  if (plan.write?.kind === "update")
    transaction.update(reference, plan.write.fields);
}

function ownerResult(plan: PrivateRepairPlan): PrivateOwnerState {
  if (plan.state === "recovery-required")
    return {
      state: plan.state,
      safeSettings: plan.safeSettings,
      issues: plan.issues,
    };
  return { state: plan.state, user: plan.user, repaired: plan.repaired };
}

/** Shared by own settings and sign-in; no auth/session/Next/billing dependency. */
export async function recoverPrivateUser(
  uid: string,
  verifiedEmail: string,
  options: { allowMissingProfile?: boolean } = {},
): Promise<PrivateOwnerState | { state: "onboarding-required" }> {
  const email = trustedEmail(verifiedEmail);
  const db = adminDb();
  return db.runTransaction(async (transaction) => {
    const userRef = db.doc(`users/${uid}`);
    const privateRef = db.doc(`userPrivate/${uid}`);
    const jobRef = db.doc(`accountDeletions/${uid}`);
    const [user, privateUser, job] = await transaction.getAll(
      userRef,
      privateRef,
      jobRef,
    );
    const raw = privateUser.data();
    assertNoDeletionEvidence(raw, job.exists);
    if (!user.exists && options.allowMissingProfile)
      return { state: "onboarding-required" as const };
    const plan = planPrivateUserRepair(
      raw,
      email,
      {
        profile: !user.exists
          ? "missing"
          : user.data()?.status === "active"
            ? "active"
            : "inactive",
        deletionJobExists: job.exists,
      },
      FieldValue.serverTimestamp(),
    );
    applyPrivateUserPlan(transaction, privateRef, plan);
    return ownerResult(plan);
  });
}

/** Strict validated owner save; current identity and deletion fences stay private. */
export async function savePrivateSettings(
  uid: string,
  verifiedEmail: string,
  input: PrivateSettings,
): Promise<void> {
  // Validate here too, so callers cannot accidentally bypass the route schema.
  const settings = privateSettingsSchema.parse(input);
  const db = adminDb();
  await db.runTransaction(async (transaction) => {
    const privateRef = db.doc(`userPrivate/${uid}`);
    const [user, privateUser, job] = await transaction.getAll(
      db.doc(`users/${uid}`),
      privateRef,
      db.doc(`accountDeletions/${uid}`),
    );
    const raw = privateUser.data();
    const now = FieldValue.serverTimestamp();
    const plan = planPrivateUserRepair(
      raw,
      verifiedEmail,
      {
        profile: !user.exists
          ? "missing"
          : user.data()?.status === "active"
            ? "active"
            : "inactive",
        deletionJobExists: job.exists,
      },
      now,
    );
    if (plan.state === "recovery-required")
      throw new PrivateRecoveryError("recovery-required");
    if (plan.write?.kind === "create") {
      // No private document exists. Defaults and this explicit save commit once.
      transaction.create(privateRef, { ...plan.write.data, ...settings });
      return;
    }
    const fields: Data =
      plan.write?.kind === "update" ? { ...plan.write.fields } : {};
    for (const parentName of [
      "contactDetails",
      "privacySettings",
      "notificationSettings",
    ] as const)
      for (const key of Object.keys(settings[parentName])) {
        const value = (settings[parentName] as Data)[key];
        const storedParent = raw![parentName];
        if (!map(storedParent) || storedParent[key] !== value)
          fields[`${parentName}.${key}`] = value;
      }
    if (!Object.keys(fields).length) return;
    fields.updatedAt = now;
    transaction.update(privateRef, fields);
  });
}
