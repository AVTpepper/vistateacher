import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { resolveEffectivePlan } from "@/lib/entitlements/plan-entitlements";
import { adminDb } from "@/lib/firebase/admin";
import { matchesDiscoveryFilters } from "@/lib/network/discovery-policy";
import { canFollow } from "@/lib/network/follow-policy";
import { profileDocumentSchema, type ProfileDocument } from "@/schemas/profile";
import type { DiscoveryFilters } from "@/schemas/network";
import type {
  Plan,
  SubscriptionRecord,
  SubscriptionStatus,
} from "@/types/models";

export interface EducatorDiscoveryResult {
  profile: ProfileDocument;
  isFollowing: boolean;
}

export class NetworkActionError extends Error {
  constructor(
    public readonly code:
      "self" | "already-following" | "inactive" | "limit-reached" | "not-found",
  ) {
    super(code);
  }
}

export function getFollowId(followerUid: string, followingUid: string): string {
  return `${followerUid}_${followingUid}`;
}

function subscriptionRecord(
  data: FirebaseFirestore.DocumentData | undefined,
): SubscriptionRecord | null {
  if (!data) return null;
  const date = (value: unknown) =>
    value instanceof Timestamp ? value.toDate() : null;
  return {
    plan: data.plan === "plus" ? "plus" : "free",
    status: String(data.status ?? "free") as SubscriptionStatus,
    stripeCustomerId:
      typeof data.stripeCustomerId === "string" ? data.stripeCustomerId : null,
    stripeSubscriptionId:
      typeof data.stripeSubscriptionId === "string"
        ? data.stripeSubscriptionId
        : null,
    stripePriceId:
      typeof data.stripePriceId === "string" ? data.stripePriceId : null,
    billingInterval:
      data.billingInterval === "month" || data.billingInterval === "year"
        ? data.billingInterval
        : null,
    currentPeriodEnd: date(data.currentPeriodEnd),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
    trialStartedAt: date(data.trialStartedAt),
    trialEndsAt: date(data.trialEndsAt),
    trialConsumed: data.trialConsumed === true,
    updatedAt: date(data.updatedAt) ?? new Date(0),
  };
}

export async function discoverEducators(
  viewerUid: string,
  filters: DiscoveryFilters,
): Promise<EducatorDiscoveryResult[]> {
  const db = adminDb();
  const [profilesSnapshot, followsSnapshot] = await Promise.all([
    db.collection("users").where("status", "==", "active").limit(100).get(),
    db
      .collection("follows")
      .where("followerUid", "==", viewerUid)
      .limit(100)
      .get(),
  ]);
  const following = new Set(
    followsSnapshot.docs.map((document) =>
      String(document.data().followingUid),
    ),
  );

  return profilesSnapshot.docs
    .map((document) => profileDocumentSchema.safeParse(document.data()))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter(
      (profile) =>
        profile.uid !== viewerUid && matchesDiscoveryFilters(profile, filters),
    )
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, 30)
    .map((profile) => ({ profile, isFollowing: following.has(profile.uid) }));
}

export async function getNetworkList(
  viewerUid: string,
  profileUid: string,
  view: "followers" | "following" | "suggestions",
): Promise<EducatorDiscoveryResult[]> {
  if (view === "suggestions") {
    const currentSnapshot = await adminDb().doc(`users/${viewerUid}`).get();
    const current = profileDocumentSchema.parse(currentSnapshot.data());
    const candidates = await discoverEducators(viewerUid, {
      query: "",
      subject: "",
      grade: "",
      location: "",
      verified: false,
    });
    return candidates
      .filter((candidate) => !candidate.isFollowing)
      .sort((left, right) => {
        const score = (profile: ProfileDocument) =>
          Number(profile.gradeLevel === current.gradeLevel) +
          Number(profile.city === current.city) +
          profile.subjects.filter((subject) =>
            current.subjects.includes(subject),
          ).length *
            2;
        return score(right.profile) - score(left.profile);
      })
      .slice(0, 20);
  }

  const field = view === "followers" ? "followingUid" : "followerUid";
  const relatedField = view === "followers" ? "followerUid" : "followingUid";
  const relationships = await adminDb()
    .collection("follows")
    .where(field, "==", profileUid)
    .limit(100)
    .get();
  const uids = relationships.docs.map((document) =>
    String(document.data()[relatedField]),
  );
  const viewerFollows = await adminDb()
    .collection("follows")
    .where("followerUid", "==", viewerUid)
    .limit(100)
    .get();
  const following = new Set(
    viewerFollows.docs.map((document) => String(document.data().followingUid)),
  );
  const profiles = await Promise.all(
    uids.map((uid) => adminDb().doc(`users/${uid}`).get()),
  );

  return profiles.flatMap((snapshot) => {
    const result = profileDocumentSchema.safeParse(snapshot.data());
    if (!result.success || result.data.status !== "active") return [];
    return [
      {
        profile: result.data,
        isFollowing: following.has(result.data.uid),
      },
    ];
  });
}

export async function followEducator(
  followerUid: string,
  followingUid: string,
): Promise<void> {
  const db = adminDb();
  await db.runTransaction(async (transaction) => {
    const followerRef = db.doc(`users/${followerUid}`);
    const followingRef = db.doc(`users/${followingUid}`);
    const followRef = db.doc(
      `follows/${getFollowId(followerUid, followingUid)}`,
    );
    const subscriptionRef = db.doc(`subscriptions/${followerUid}`);
    const [
      followerSnapshot,
      followingSnapshot,
      followSnapshot,
      subscriptionSnapshot,
    ] = await Promise.all([
      transaction.get(followerRef),
      transaction.get(followingRef),
      transaction.get(followRef),
      transaction.get(subscriptionRef),
    ]);
    if (!followerSnapshot.exists || !followingSnapshot.exists)
      throw new NetworkActionError("not-found");

    const follower = profileDocumentSchema.parse(followerSnapshot.data());
    const following = profileDocumentSchema.parse(followingSnapshot.data());
    const plan: Plan = resolveEffectivePlan(
      subscriptionRecord(subscriptionSnapshot.data()),
    );
    const decision = canFollow({
      followerUid,
      followingUid,
      followerStatus: follower.status,
      followingStatus: following.status,
      alreadyFollowing: followSnapshot.exists,
      followingCount: follower.followingCount,
      plan,
    });
    if (!decision.allowed) throw new NetworkActionError(decision.reason);

    const now = FieldValue.serverTimestamp();
    transaction.create(followRef, {
      followerUid,
      followingUid,
      createdAt: now,
    });
    transaction.update(followerRef, {
      followingCount: follower.followingCount + 1,
      updatedAt: now,
    });
    transaction.update(followingRef, {
      followerCount: following.followerCount + 1,
      updatedAt: now,
    });
  });
}

export async function unfollowEducator(
  followerUid: string,
  followingUid: string,
): Promise<void> {
  const db = adminDb();
  await db.runTransaction(async (transaction) => {
    const followerRef = db.doc(`users/${followerUid}`);
    const followingRef = db.doc(`users/${followingUid}`);
    const followRef = db.doc(
      `follows/${getFollowId(followerUid, followingUid)}`,
    );
    const [followerSnapshot, followingSnapshot, followSnapshot] =
      await Promise.all([
        transaction.get(followerRef),
        transaction.get(followingRef),
        transaction.get(followRef),
      ]);
    if (!followSnapshot.exists) return;
    if (!followerSnapshot.exists || !followingSnapshot.exists)
      throw new NetworkActionError("not-found");

    const follower = profileDocumentSchema.parse(followerSnapshot.data());
    const following = profileDocumentSchema.parse(followingSnapshot.data());
    const now = FieldValue.serverTimestamp();
    transaction.delete(followRef);
    transaction.update(followerRef, {
      followingCount: Math.max(0, follower.followingCount - 1),
      updatedAt: now,
    });
    transaction.update(followingRef, {
      followerCount: Math.max(0, following.followerCount - 1),
      updatedAt: now,
    });
  });
}
