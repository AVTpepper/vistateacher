import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { getFollowId } from "@/lib/network/server";
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
  isFollowing: boolean | null;
}

function joinedLabel(value: unknown): string {
  if (!(value instanceof Timestamp)) return "Recently";
  return value.toDate().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export async function getProfileView(
  uid: string,
  viewerUid: string | null,
): Promise<ProfileView | null> {
  const db = adminDb();
  const [profileSnapshot, privateSnapshot, subscriptionSnapshot] =
    await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`userPrivate/${uid}`).get(),
      db.doc(`subscriptions/${uid}`).get(),
    ]);
  if (!profileSnapshot.exists) return null;

  const profile = profileDocumentSchema.parse(profileSnapshot.data());
  if (profile.status === "deleted") return null;

  const privateUser = privateSnapshot.exists
    ? privateUserDocumentSchema.parse(privateSnapshot.data())
    : null;
  const isOwner = viewerUid === uid;
  const relationshipSnapshot =
    viewerUid && !isOwner
      ? await db.doc(`follows/${getFollowId(viewerUid, uid)}`).get()
      : null;
  const canViewContact = canViewContactDetails(
    uid,
    viewerUid,
    privateUser?.privacySettings.shareContactInfo === true,
  );

  return {
    profile,
    joinedLabel: joinedLabel(profile.createdAt),
    plan: subscriptionSnapshot.data()?.plan === "plus" ? "plus" : "free",
    contactDetails:
      canViewContact && privateUser ? privateUser.contactDetails : null,
    isOwner,
    isFollowing: relationshipSnapshot?.exists ?? null,
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
        ...input.subjects,
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
