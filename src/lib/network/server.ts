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
  connectionStatus: "none" | "pending" | "accepted";
  connectionDirection: "incoming" | "outgoing" | null;
  relationshipId: string | null;
}

export interface ConnectionRelationship {
  status: "none" | "pending" | "accepted";
  direction: "incoming" | "outgoing" | null;
  relationshipId: string | null;
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

function relationshipFromDocuments(
  viewerUid: string,
  documents: FirebaseFirestore.DocumentSnapshot[],
): ConnectionRelationship {
  const existing = documents.filter((document) => document.exists);
  if (!existing.length)
    return { status: "none", direction: null, relationshipId: null };
  const document =
    existing.find((item) => item.data()?.status === "accepted") ?? existing[0]!;
  const data = document.data()!;
  return {
    status: data.status === "pending" ? "pending" : "accepted",
    direction: data.followerUid === viewerUid ? "outgoing" : "incoming",
    relationshipId: document.id,
  };
}

export async function resolveConnectionRelationship(
  viewerUid: string,
  targetUid: string,
): Promise<ConnectionRelationship> {
  if (viewerUid === targetUid)
    return { status: "none", direction: null, relationshipId: null };
  const db = adminDb();
  const documents = await db.getAll(
    db.doc(`follows/${getFollowId(viewerUid, targetUid)}`),
    db.doc(`follows/${getFollowId(targetUid, viewerUid)}`),
  );
  return relationshipFromDocuments(viewerUid, documents);
}

async function relationshipsForUser(
  uid: string,
): Promise<Map<string, ConnectionRelationship>> {
  const db = adminDb();
  const [outgoing, incoming] = await Promise.all([
    db.collection("follows").where("followerUid", "==", uid).limit(100).get(),
    db.collection("follows").where("followingUid", "==", uid).limit(100).get(),
  ]);
  const grouped = new Map<string, FirebaseFirestore.DocumentSnapshot[]>();
  for (const document of [...outgoing.docs, ...incoming.docs]) {
    const data = document.data();
    const otherUid = String(
      data.followerUid === uid ? data.followingUid : data.followerUid,
    );
    grouped.set(otherUid, [...(grouped.get(otherUid) ?? []), document]);
  }
  return new Map(
    [...grouped].map(([otherUid, documents]) => [
      otherUid,
      relationshipFromDocuments(uid, documents),
    ]),
  );
}

export async function getAcceptedConnectionUids(
  uid: string,
): Promise<Set<string>> {
  const relationships = await relationshipsForUser(uid);
  return new Set(
    [...relationships]
      .filter(([, relationship]) => relationship.status === "accepted")
      .map(([otherUid]) => otherUid),
  );
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
  const [profilesSnapshot, relationships] = await Promise.all([
    db.collection("users").where("status", "==", "active").limit(100).get(),
    relationshipsForUser(viewerUid),
  ]);

  return profilesSnapshot.docs
    .map((document) => profileDocumentSchema.safeParse(document.data()))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter(
      (profile) =>
        profile.uid !== viewerUid && matchesDiscoveryFilters(profile, filters),
    )
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .map((profile) => {
      const relationship = relationships.get(profile.uid) ?? {
        status: "none" as const,
        direction: null,
        relationshipId: null,
      };
      return {
        profile,
        connectionStatus: relationship.status,
        connectionDirection: relationship.direction,
        relationshipId: relationship.relationshipId,
      };
    })
    .filter((result) => result.connectionStatus !== "accepted")
    .slice(0, 30);
}

export async function getRegisteredUserCountries(): Promise<string[]> {
  const snapshot = await adminDb()
    .collection("users")
    .where("status", "==", "active")
    .select("country")
    .get();
  const countries = new Map<string, string>();

  for (const document of snapshot.docs) {
    const rawCountry = document.data().country;
    if (typeof rawCountry !== "string") continue;

    const country = rawCountry.trim().replace(/\s+/g, " ");
    if (country.length < 2 || country.length > 80) continue;
    const key = country.toLocaleLowerCase("en-US");
    if (!countries.has(key)) countries.set(key, country);
  }

  return [...countries.values()].sort((left, right) =>
    left.localeCompare(right, "en", { sensitivity: "base" }),
  );
}

export async function getNetworkList(
  viewerUid: string,
  profileUid: string,
  view: "connections" | "suggestions",
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
      .filter(
        (candidate) =>
          candidate.connectionStatus === "none" ||
          (candidate.connectionStatus === "pending" &&
            candidate.connectionDirection === "outgoing"),
      )
      .sort((left, right) => {
        const score = (profile: ProfileDocument) =>
          Number(profile.gradeLevel === current.gradeLevel) +
          Number(profile.city === current.city) +
          profile.professionalRoles.filter((role) =>
            current.professionalRoles.includes(role),
          ).length +
          profile.subjects.filter((subject) =>
            current.subjects.includes(subject),
          ).length *
            2 +
          profile.languages.filter((language) =>
            current.languages.includes(language),
          ).length;
        return score(right.profile) - score(left.profile);
      })
      .slice(0, 20);
  }

  // connections view - get accepted connections with the profile
  const db = adminDb();
  const [outgoing, incoming, viewerRelationships] = await Promise.all([
    db
      .collection("follows")
      .where("followerUid", "==", profileUid)
      .where("status", "==", "accepted")
      .limit(100)
      .get(),
    db
      .collection("follows")
      .where("followingUid", "==", profileUid)
      .where("status", "==", "accepted")
      .limit(100)
      .get(),
    relationshipsForUser(viewerUid),
  ]);
  const uids = [
    ...new Set([
      ...outgoing.docs.map((document) => String(document.data().followingUid)),
      ...incoming.docs.map((document) => String(document.data().followerUid)),
    ]),
  ];
  const profiles = await Promise.all(
    uids.map((uid) => db.doc(`users/${uid}`).get()),
  );

  return profiles.flatMap((snapshot) => {
    const result = profileDocumentSchema.safeParse(snapshot.data());
    if (!result.success || result.data.status !== "active") return [];
    const relationship = viewerRelationships.get(result.data.uid) ?? {
      status: "none" as const,
      direction: null,
      relationshipId: null,
    };
    return [
      {
        profile: result.data,
        connectionStatus: relationship.status,
        connectionDirection: relationship.direction,
        relationshipId: relationship.relationshipId,
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
    const reverseFollowRef = db.doc(
      `follows/${getFollowId(followingUid, followerUid)}`,
    );
    const subscriptionRef = db.doc(`subscriptions/${followerUid}`);
    const [
      followerSnapshot,
      followingSnapshot,
      followSnapshot,
      reverseFollowSnapshot,
      subscriptionSnapshot,
    ] = await transaction.getAll(
      followerRef,
      followingRef,
      followRef,
      reverseFollowRef,
      subscriptionRef,
    );
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
      alreadyFollowing: followSnapshot.exists || reverseFollowSnapshot.exists,
      followingCount: follower.connectionCount,
      plan,
    });
    if (!decision.allowed) throw new NetworkActionError(decision.reason);

    const now = FieldValue.serverTimestamp();
    transaction.create(followRef, {
      followerUid,
      followingUid,
      status: "pending",
      createdAt: now,
    });
    transaction.set(
      db.doc(`users/${followingUid}/notifications/follow_${followerUid}`),
      {
        type: "follow",
        actorId: followerUid,
        actorName: follower.displayName,
        entityId: followerUid,
        message: `${follower.displayName} sent you a connection request.`,
        href: `/profile/${followerUid}`,
        read: false,
        archived: false,
        createdAt: now,
      },
    );
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
    const reverseFollowRef = db.doc(
      `follows/${getFollowId(followingUid, followerUid)}`,
    );
    const [
      followerSnapshot,
      followingSnapshot,
      followSnapshot,
      reverseFollowSnapshot,
    ] = await transaction.getAll(
      followerRef,
      followingRef,
      followRef,
      reverseFollowRef,
    );
    if (!followSnapshot.exists && !reverseFollowSnapshot.exists) return;
    if (!followerSnapshot.exists || !followingSnapshot.exists)
      throw new NetworkActionError("not-found");

    const follower = profileDocumentSchema.parse(followerSnapshot.data());
    const following = profileDocumentSchema.parse(followingSnapshot.data());
    const accepted = [followSnapshot, reverseFollowSnapshot].some(
      (snapshot) => snapshot.exists && snapshot.data()?.status === "accepted",
    );
    const now = FieldValue.serverTimestamp();
    if (followSnapshot.exists) transaction.delete(followRef);
    if (reverseFollowSnapshot.exists) transaction.delete(reverseFollowRef);

    // Only decrement counts if the relationship was accepted
    if (accepted) {
      transaction.update(followerRef, {
        connectionCount: Math.max(0, follower.connectionCount - 1),
        updatedAt: now,
      });
      transaction.update(followingRef, {
        connectionCount: Math.max(0, following.connectionCount - 1),
        updatedAt: now,
      });
    }

    transaction.delete(
      db.doc(`users/${followingUid}/notifications/follow_${followerUid}`),
    );
    transaction.delete(
      db.doc(`users/${followerUid}/notifications/follow_${followingUid}`),
    );
  });
}

export async function acceptConnectionRequest(
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
    const reverseFollowRef = db.doc(
      `follows/${getFollowId(followingUid, followerUid)}`,
    );
    const [
      followerSnapshot,
      followingSnapshot,
      followSnapshot,
      reverseFollowSnapshot,
    ] = await transaction.getAll(
      followerRef,
      followingRef,
      followRef,
      reverseFollowRef,
    );
    if (!followSnapshot.exists) return;
    if (!followerSnapshot.exists || !followingSnapshot.exists)
      throw new NetworkActionError("not-found");

    const followData = followSnapshot.data() as Record<string, unknown>;
    if (followData.status !== "pending") return;

    if (reverseFollowSnapshot.exists) {
      if (reverseFollowSnapshot.data()?.status === "accepted") {
        transaction.delete(followRef);
        return;
      }
      transaction.delete(reverseFollowRef);
    }

    const follower = profileDocumentSchema.parse(followerSnapshot.data());
    const following = profileDocumentSchema.parse(followingSnapshot.data());
    const now = FieldValue.serverTimestamp();

    transaction.update(followRef, {
      status: "accepted",
      updatedAt: now,
    });
    transaction.update(followerRef, {
      connectionCount: follower.connectionCount + 1,
      updatedAt: now,
    });
    transaction.update(followingRef, {
      connectionCount: following.connectionCount + 1,
      updatedAt: now,
    });
    transaction.set(
      db.doc(`users/${followerUid}/notifications/accept_${followingUid}`),
      {
        type: "accept",
        actorId: followingUid,
        actorName: following.displayName,
        entityId: followingUid,
        message: `${following.displayName} accepted your connection request.`,
        href: `/profile/${followingUid}`,
        read: false,
        archived: false,
        createdAt: now,
      },
    );
  });
}
