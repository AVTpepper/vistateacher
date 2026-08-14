import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getBillingState } from "@/lib/billing/server";
import { adminDb } from "@/lib/firebase/admin";
import { resolveConnectionRelationship } from "@/lib/network/server";
import { canViewContactDetails } from "@/lib/profiles/privacy";
import {
  createSearchKeywords,
  normalizeSearchText,
} from "@/lib/search/normalize";
import {
  privateUserDocumentSchema,
  profileDocumentSchema,
  type PrivateSettings,
  type PrivateUserDocument,
  type ProfileDocument,
  type ProfileUpdate,
} from "@/schemas/profile";
import type { Plan } from "@/types/models";

export interface ProfileView {
  profile: ProfileDocument;
  joinedLabel: string;
  plan: Plan;
  contactDetails: PrivateSettings["contactDetails"] | null;
  isOwner: boolean;
  connectionStatus: "none" | "pending" | "accepted" | null;
  connectionDirection: "incoming" | "outgoing" | null;
}

function joinedLabel(value: unknown): string {
  if (!(value instanceof Timestamp)) return "Recently";
  return value.toDate().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

async function recordUniqueProfileView(
  profileUid: string,
  viewerUid: string,
): Promise<void> {
  const db = adminDb();
  await db.runTransaction(async (transaction) => {
    const viewRef = db.doc(`profileViews/${profileUid}_${viewerUid}`);
    const analyticsRef = db.doc(`userAnalytics/${profileUid}`);
    const [view, analytics] = await Promise.all([
      transaction.get(viewRef),
      transaction.get(analyticsRef),
    ]);
    if (view.exists) return;
    transaction.create(viewRef, {
      profileUid,
      viewerUid,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(
      analyticsRef,
      {
        profileViews:
          (typeof analytics.data()?.profileViews === "number"
            ? Math.max(0, Math.trunc(analytics.data()!.profileViews))
            : 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export async function getProfileView(
  uid: string,
  viewerUid: string | null,
): Promise<ProfileView | null> {
  const db = adminDb();
  const [profileSnapshot, privateSnapshot, billing] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`userPrivate/${uid}`).get(),
    getBillingState(uid).catch(() => null),
  ]);
  if (!profileSnapshot.exists) return null;

  const profile = profileDocumentSchema.parse(profileSnapshot.data());
  if (profile.status === "deleted") return null;

  const privateUser = privateSnapshot.exists
    ? privateUserDocumentSchema.parse(privateSnapshot.data())
    : null;
  const isOwner = viewerUid === uid;
  const [relationship] = await Promise.all([
    viewerUid && !isOwner
      ? resolveConnectionRelationship(viewerUid, uid)
      : Promise.resolve(null),
    viewerUid && !isOwner
      ? recordUniqueProfileView(uid, viewerUid)
      : Promise.resolve(),
  ]);
  const canViewContact = canViewContactDetails(
    uid,
    viewerUid,
    privateUser?.privacySettings.shareContactInfo === true,
  );

  let connectionStatus: "none" | "pending" | "accepted" | null = null;
  let connectionDirection: "incoming" | "outgoing" | null = null;
  if (viewerUid && !isOwner) {
    connectionStatus = relationship?.status ?? "none";
    connectionDirection = relationship?.direction ?? null;
  }

  return {
    profile,
    joinedLabel: joinedLabel(profile.createdAt),
    plan: billing?.effectivePlan ?? "free",
    contactDetails:
      canViewContact && privateUser ? privateUser.contactDetails : null,
    isOwner,
    connectionStatus,
    connectionDirection,
  };
}

export async function getPrivateUser(
  uid: string,
  email: string,
): Promise<PrivateUserDocument> {
  const db = adminDb();
  const reference = db.doc(`userPrivate/${uid}`);
  let snapshot = await reference.get();
  if (!snapshot.exists) {
    const now = FieldValue.serverTimestamp();
    await reference
      .create({
        email,
        contactDetails: {},
        privacySettings: { shareContactInfo: false },
        notificationSettings: { email: true, inApp: true },
        accountDeletion: { requestedAt: null },
        createdAt: now,
        updatedAt: now,
      })
      .catch((error: unknown) => {
        const code =
          typeof error === "object" && error && "code" in error
            ? Number(error.code)
            : 0;
        if (code !== 6) throw error;
      });
    snapshot = await reference.get();
  }
  return privateUserDocumentSchema.parse(snapshot.data());
}

export async function updateProfile(
  uid: string,
  input: ProfileUpdate,
): Promise<void> {
  await adminDb()
    .doc(`users/${uid}`)
    .update({
      ...input,
      displayNameLower: normalizeSearchText(input.displayName),
      cityLower: normalizeSearchText(input.city),
      schoolLower: normalizeSearchText(input.school),
      searchKeywords: createSearchKeywords([
        input.displayName,
        input.city,
        input.school,
        ...input.professionalRoles,
        ...input.subjects,
        ...input.languages,
        ...input.interests,
      ]),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function updatePrivateSettings(
  uid: string,
  input: PrivateSettings,
): Promise<void> {
  await adminDb()
    .doc(`userPrivate/${uid}`)
    .update({
      ...input,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function requestAccountDeletion(uid: string): Promise<void> {
  await adminDb()
    .doc(`userPrivate/${uid}`)
    .update({
      accountDeletion: { requestedAt: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
    });
}
