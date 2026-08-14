import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  resolveEffectivePlan,
  PLAN_ENTITLEMENTS,
} from "@/lib/entitlements/plan-entitlements";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import {
  canDownloadResource,
  canReserveResource,
} from "@/lib/resources/policy";
import type {
  ReserveResourceInput,
  ResourceAccess,
  ResourceQuery,
  ResourceReviewInput,
  ResourceType,
  UpdateResourceInput,
} from "@/schemas/resource";
import type { SubscriptionRecord, SubscriptionStatus } from "@/types/models";

const RESOURCE_LIMIT = 100;

export interface ResourceSummary {
  id: string;
  author: { uid: string; displayName: string; photoURL: string | null };
  title: string;
  description: string;
  type: ResourceType;
  subject: string;
  gradeLevel: string;
  tags: string[];
  accessTier: ResourceAccess;
  downloadCount: number;
  ratingAverage: number;
  ratingCount: number;
  createdAt: string;
}

export interface ResourceDetail extends ResourceSummary {
  fileName: string;
  fileType: string;
  fileSize: number;
  ownedByViewer: boolean;
  canDownload: boolean;
  downloadBlockReason:
    "plus-required" | "download-limit-reached" | "inactive" | null;
}

export interface ResourceReview {
  id: string;
  author: { uid: string; displayName: string; photoURL: string | null };
  rating: number;
  review: string;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  ownedByViewer: boolean;
}

export class ResourceActionError extends Error {
  constructor(
    public readonly code:
      | "inactive"
      | "limit-reached"
      | "not-found"
      | "not-owner"
      | "not-ready"
      | "invalid-upload"
      | "plus-required"
      | "download-limit-reached"
      | "own-review",
  ) {
    super(code);
  }
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

function periodKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function extensionForMime(mime: ReserveResourceInput["fileType"]): string {
  const extensions: Record<ReserveResourceInput["fileType"], string> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "pptx",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
  };
  return extensions[mime];
}

function timestamp(value: unknown): string {
  return (
    value instanceof Timestamp ? value.toDate() : new Date(0)
  ).toISOString();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function summary(
  id: string,
  data: FirebaseFirestore.DocumentData,
  author: FirebaseFirestore.DocumentData | undefined,
): ResourceSummary {
  return {
    id,
    author: {
      uid: String(data.authorId),
      displayName: String(author?.displayName ?? "Educator"),
      photoURL: typeof author?.photoURL === "string" ? author.photoURL : null,
    },
    title: String(data.title),
    description: String(data.description),
    type: data.type as ResourceType,
    subject: String(data.subject),
    gradeLevel: String(data.gradeLevel),
    tags: stringArray(data.tags),
    accessTier: data.accessTier === "plus" ? "plus" : "free",
    downloadCount: number(data.downloadCount),
    ratingAverage: number(data.ratingAverage),
    ratingCount: number(data.ratingCount),
    createdAt: timestamp(data.createdAt),
  };
}

export async function reserveResourceUpload(
  uid: string,
  input: ReserveResourceInput,
): Promise<{
  resourceId: string;
  uploadPath: string;
  uploadsRemaining: number | null;
}> {
  const db = adminDb();
  const resourceRef = db.collection("resources").doc();
  const period = periodKey();
  const usageRef = db.doc(`usage/${uid}_${period}`);
  const uploadPath = `resources/${uid}/${resourceRef.id}/resource.${extensionForMime(input.fileType)}`;
  let uploadsRemaining: number | null = null;

  await db.runTransaction(async (transaction) => {
    const [user, subscription, usage] = await Promise.all([
      transaction.get(db.doc(`users/${uid}`)),
      transaction.get(db.doc(`subscriptions/${uid}`)),
      transaction.get(usageRef),
    ]);
    const plan = resolveEffectivePlan(subscriptionRecord(subscription.data()));
    const uploads = number(usage.data()?.resourceUploads);
    const decision = canReserveResource({
      status: user.data()?.status ?? "deleted",
      plan,
      uploadsThisMonth: uploads,
    });
    if (!decision.allowed) throw new ResourceActionError(decision.reason);
    const limit = PLAN_ENTITLEMENTS[plan].resourceUploadsPerMonth;
    uploadsRemaining = limit === null ? null : Math.max(0, limit - uploads - 1);
    transaction.set(
      usageRef,
      {
        uid,
        period,
        resourceUploads: uploads + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.create(resourceRef, {
      authorId: uid,
      title: input.title,
      titleLower: input.title.toLocaleLowerCase("en-US"),
      description: input.description,
      type: input.type,
      subject: input.subject,
      subjectLower: input.subject.toLocaleLowerCase("en-US"),
      gradeLevel: input.gradeLevel,
      tags: [
        ...new Set(input.tags.map((tag) => tag.toLocaleLowerCase("en-US"))),
      ],
      accessTier: input.accessTier,
      filePath: uploadPath,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      thumbnailURL: null,
      downloadCount: 0,
      ratingTotal: 0,
      ratingAverage: 0,
      ratingCount: 0,
      status: "uploading",
      moderationStatus: "pending",
      usagePeriod: period,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { resourceId: resourceRef.id, uploadPath, uploadsRemaining };
}

export async function finalizeResourceUpload(
  uid: string,
  resourceId: string,
): Promise<void> {
  const db = adminDb();
  const resourceRef = db.doc(`resources/${resourceId}`);
  const resource = await resourceRef.get();
  if (!resource.exists) throw new ResourceActionError("not-found");
  const data = resource.data()!;
  if (data.authorId !== uid) throw new ResourceActionError("not-owner");
  if (data.status !== "uploading") throw new ResourceActionError("not-ready");

  let metadata;
  try {
    [metadata] = await adminStorage()
      .bucket()
      .file(String(data.filePath))
      .getMetadata();
  } catch {
    await cancelResourceUpload(uid, resourceId);
    throw new ResourceActionError("invalid-upload");
  }
  if (
    metadata.contentType !== data.fileType ||
    Number(metadata.size) !== data.fileSize ||
    Number(metadata.size) > 25 * 1024 * 1024
  ) {
    await adminStorage()
      .bucket()
      .file(String(data.filePath))
      .delete({ ignoreNotFound: true });
    await cancelResourceUpload(uid, resourceId);
    throw new ResourceActionError("invalid-upload");
  }

  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(resourceRef);
    if (!current.exists || current.data()?.authorId !== uid)
      throw new ResourceActionError("not-owner");
    if (current.data()?.status !== "uploading")
      throw new ResourceActionError("not-ready");
    transaction.update(resourceRef, {
      status: "active",
      moderationStatus: "approved",
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(db.doc(`users/${uid}`), {
      resourceCount: FieldValue.increment(1),
    });
  });
}

export async function cancelResourceUpload(
  uid: string,
  resourceId: string,
): Promise<void> {
  const db = adminDb();
  const resourceRef = db.doc(`resources/${resourceId}`);
  let filePath = "";
  await db.runTransaction(async (transaction) => {
    const resource = await transaction.get(resourceRef);
    if (!resource.exists) throw new ResourceActionError("not-found");
    const data = resource.data()!;
    if (data.authorId !== uid) throw new ResourceActionError("not-owner");
    if (data.status !== "uploading") throw new ResourceActionError("not-ready");
    filePath = String(data.filePath);
    const usageRef = db.doc(`usage/${uid}_${data.usagePeriod}`);
    const usage = await transaction.get(usageRef);
    transaction.set(
      usageRef,
      {
        resourceUploads: Math.max(0, number(usage.data()?.resourceUploads) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.delete(resourceRef);
  });
  if (filePath)
    await adminStorage()
      .bucket()
      .file(filePath)
      .delete({ ignoreNotFound: true });
}

export async function listResources(
  query: ResourceQuery,
): Promise<ResourceSummary[]> {
  const db = adminDb();
  const snapshot = await db
    .collection("resources")
    .where("status", "==", "active")
    .where("moderationStatus", "==", "approved")
    .orderBy("createdAt", "desc")
    .limit(RESOURCE_LIMIT)
    .get();
  const authorIds = [
    ...new Set(snapshot.docs.map((doc) => String(doc.data().authorId))),
  ];
  const authors = authorIds.length
    ? await db.getAll(...authorIds.map((uid) => db.doc(`users/${uid}`)))
    : [];
  const authorMap = new Map(
    authors.map((author) => [author.id, author.data()]),
  );
  const needle = query.query.toLocaleLowerCase("en-US");
  const resources = snapshot.docs
    .map((document) =>
      summary(
        document.id,
        document.data(),
        authorMap.get(String(document.data().authorId)),
      ),
    )
    .filter((resource) => {
      const matchesQuery =
        !needle ||
        [
          resource.title,
          resource.description,
          resource.subject,
          ...resource.tags,
        ]
          .join(" ")
          .toLocaleLowerCase("en-US")
          .includes(needle);
      return (
        matchesQuery &&
        (!query.type || resource.type === query.type) &&
        (!query.subject || resource.subject === query.subject)
      );
    });
  return resources.sort((left, right) => {
    if (query.sort === "downloads")
      return right.downloadCount - left.downloadCount;
    if (query.sort === "rating")
      return right.ratingAverage - left.ratingAverage;
    if (query.sort === "reviews") return right.ratingCount - left.ratingCount;
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export async function getResourceDetail(
  resourceId: string,
  viewerUid: string,
): Promise<{ resource: ResourceDetail; reviews: ResourceReview[] } | null> {
  const db = adminDb();
  const [
    resourceSnapshot,
    viewerSnapshot,
    subscriptionSnapshot,
    usageSnapshot,
    reviewSnapshots,
  ] = await Promise.all([
    db.doc(`resources/${resourceId}`).get(),
    db.doc(`users/${viewerUid}`).get(),
    db.doc(`subscriptions/${viewerUid}`).get(),
    db.doc(`usage/${viewerUid}_${periodKey()}`).get(),
    db
      .collection("resourceReviews")
      .where("resourceId", "==", resourceId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get(),
  ]);
  if (!resourceSnapshot.exists) return null;
  const data = resourceSnapshot.data()!;
  const ownsResource = data.authorId === viewerUid;
  if (
    (data.status !== "active" || data.moderationStatus !== "approved") &&
    !ownsResource
  )
    return null;
  const authorIds = [
    String(data.authorId),
    ...reviewSnapshots.docs.map((review) => String(review.data().authorId)),
  ];
  const authors = await db.getAll(
    ...[...new Set(authorIds)].map((uid) => db.doc(`users/${uid}`)),
  );
  const authorMap = new Map(
    authors.map((author) => [author.id, author.data()]),
  );
  const plan = resolveEffectivePlan(
    subscriptionRecord(subscriptionSnapshot.data()),
  );
  const access = canDownloadResource({
    status: viewerSnapshot.data()?.status ?? "deleted",
    plan,
    accessTier: data.accessTier === "plus" ? "plus" : "free",
    ownsResource,
    downloadsThisMonth: number(usageSnapshot.data()?.resourceDownloads),
  });
  return {
    resource: {
      ...summary(
        resourceSnapshot.id,
        data,
        authorMap.get(String(data.authorId)),
      ),
      fileName: String(data.fileName),
      fileType: String(data.fileType),
      fileSize: number(data.fileSize),
      ownedByViewer: ownsResource,
      canDownload: access.allowed,
      downloadBlockReason: access.allowed ? null : access.reason,
    },
    reviews: reviewSnapshots.docs.map((review) => {
      const reviewData = review.data();
      const authorId = String(reviewData.authorId);
      const author = authorMap.get(authorId);
      return {
        id: review.id,
        author: {
          uid: authorId,
          displayName: String(author?.displayName ?? "Educator"),
          photoURL:
            typeof author?.photoURL === "string" ? author.photoURL : null,
        },
        rating: number(reviewData.rating),
        review: String(reviewData.review),
        createdAt: timestamp(reviewData.createdAt),
        updatedAt: timestamp(reviewData.updatedAt),
        editedAt:
          reviewData.editedAt instanceof Timestamp
            ? reviewData.editedAt.toDate().toISOString()
            : null,
        ownedByViewer: authorId === viewerUid,
      };
    }),
  };
}

export async function reviewResource(
  uid: string,
  input: ResourceReviewInput,
): Promise<void> {
  const db = adminDb();
  const resourceRef = db.doc(`resources/${input.resourceId}`);
  const reviewRef = db.doc(`resourceReviews/${input.resourceId}_${uid}`);
  await db.runTransaction(async (transaction) => {
    const [resource, existing, user] = await Promise.all([
      transaction.get(resourceRef),
      transaction.get(reviewRef),
      transaction.get(db.doc(`users/${uid}`)),
    ]);
    if (!resource.exists || resource.data()?.status !== "active")
      throw new ResourceActionError("not-found");
    if (resource.data()?.authorId === uid)
      throw new ResourceActionError("own-review");
    if (user.data()?.status !== "active")
      throw new ResourceActionError("inactive");
    const previousRating = existing.exists
      ? number(existing.data()?.rating)
      : 0;
    const previousCount = number(resource.data()?.ratingCount);
    const previousTotal = number(resource.data()?.ratingTotal);
    const ratingCount = previousCount + (existing.exists ? 0 : 1);
    const ratingTotal = previousTotal - previousRating + input.rating;
    transaction.set(reviewRef, {
      resourceId: input.resourceId,
      authorId: uid,
      rating: input.rating,
      review: input.review,
      createdAt: existing.data()?.createdAt ?? FieldValue.serverTimestamp(),
      ...(existing.exists ? { editedAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(resourceRef, {
      ratingCount,
      ratingTotal,
      ratingAverage: ratingCount ? ratingTotal / ratingCount : 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function deleteResourceReview(
  uid: string,
  resourceId: string,
): Promise<void> {
  const db = adminDb();
  const resourceRef = db.doc(`resources/${resourceId}`);
  const reviewRef = db.doc(`resourceReviews/${resourceId}_${uid}`);
  await db.runTransaction(async (transaction) => {
    const [resource, review] = await Promise.all([
      transaction.get(resourceRef),
      transaction.get(reviewRef),
    ]);
    if (!resource.exists || resource.data()?.status !== "active")
      throw new ResourceActionError("not-found");
    if (!review.exists) throw new ResourceActionError("not-found");
    const previousRating = number(review.data()?.rating);
    const previousCount = number(resource.data()?.ratingCount);
    const previousTotal = number(resource.data()?.ratingTotal);
    const ratingCount = Math.max(0, previousCount - 1);
    const ratingTotal = Math.max(0, previousTotal - previousRating);
    transaction.delete(reviewRef);
    transaction.update(resourceRef, {
      ratingCount,
      ratingTotal,
      ratingAverage: ratingCount ? ratingTotal / ratingCount : 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function updateResource(
  uid: string,
  input: UpdateResourceInput,
): Promise<void> {
  const db = adminDb();
  const resourceRef = db.doc(`resources/${input.resourceId}`);
  await db.runTransaction(async (transaction) => {
    const [resource, user] = await Promise.all([
      transaction.get(resourceRef),
      transaction.get(db.doc(`users/${uid}`)),
    ]);
    if (!resource.exists) throw new ResourceActionError("not-found");
    if (resource.data()?.authorId !== uid)
      throw new ResourceActionError("not-owner");
    if (user.data()?.status !== "active")
      throw new ResourceActionError("inactive");
    transaction.update(resourceRef, {
      title: input.title,
      titleLower: input.title.toLocaleLowerCase("en-US"),
      description: input.description,
      type: input.type,
      subject: input.subject,
      subjectLower: input.subject.toLocaleLowerCase("en-US"),
      gradeLevel: input.gradeLevel,
      tags: [
        ...new Set(input.tags.map((tag) => tag.toLocaleLowerCase("en-US"))),
      ],
      accessTier: input.accessTier,
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function downloadResource(
  uid: string,
  resourceId: string,
): Promise<{ bytes: Buffer; fileName: string; contentType: string }> {
  const db = adminDb();
  const now = new Date();
  const period = periodKey(now);
  const resourceRef = db.doc(`resources/${resourceId}`);
  const usageRef = db.doc(`usage/${uid}_${period}`);
  const [resource, user, subscription, usage] = await Promise.all([
    resourceRef.get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`subscriptions/${uid}`).get(),
    usageRef.get(),
  ]);
  if (!resource.exists || resource.data()?.status !== "active")
    throw new ResourceActionError("not-found");
  const data = resource.data()!;
  const plan = resolveEffectivePlan(
    subscriptionRecord(subscription.data()),
    now,
  );
  const decision = canDownloadResource({
    status: user.data()?.status ?? "deleted",
    plan,
    accessTier: data.accessTier === "plus" ? "plus" : "free",
    ownsResource: data.authorId === uid,
    downloadsThisMonth: number(usage.data()?.resourceDownloads),
  });
  if (!decision.allowed) throw new ResourceActionError(decision.reason);
  let bytes: Buffer;
  try {
    [bytes] = await adminStorage()
      .bucket()
      .file(String(data.filePath))
      .download();
  } catch {
    throw new ResourceActionError("not-ready");
  }
  await db.runTransaction(async (transaction) => {
    const [currentResource, currentUser, currentSubscription, currentUsage] =
      await transaction.getAll(
        resourceRef,
        db.doc(`users/${uid}`),
        db.doc(`subscriptions/${uid}`),
        usageRef,
      );
    if (!currentResource.exists || currentResource.data()?.status !== "active")
      throw new ResourceActionError("not-found");
    const currentPlan = resolveEffectivePlan(
      subscriptionRecord(currentSubscription.data()),
      now,
    );
    const ownsResource = currentResource.data()?.authorId === uid;
    const downloads = number(currentUsage.data()?.resourceDownloads);
    const currentDecision = canDownloadResource({
      status: currentUser.data()?.status ?? "deleted",
      plan: currentPlan,
      accessTier:
        currentResource.data()?.accessTier === "plus" ? "plus" : "free",
      ownsResource,
      downloadsThisMonth: downloads,
    });
    if (!currentDecision.allowed)
      throw new ResourceActionError(currentDecision.reason);
    const limit = PLAN_ENTITLEMENTS[currentPlan].resourceDownloadsPerMonth;
    if (!ownsResource && limit !== null) {
      transaction.set(
        usageRef,
        {
          uid,
          period,
          resourceDownloads: downloads + 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    transaction.update(resourceRef, {
      downloadCount: FieldValue.increment(1),
    });
    const ownerId = String(currentResource.data()?.authorId ?? "");
    if (!ownsResource && ownerId) {
      transaction.set(
        db.doc(
          `users/${ownerId}/notifications/resource-download_${resourceId}_${uid}`,
        ),
        {
          type: "resource-download",
          actorId: uid,
          actorName: String(currentUser.data()?.displayName ?? "An educator"),
          entityId: resourceId,
          message: `${String(currentUser.data()?.displayName ?? "An educator")} downloaded your resource.`,
          href: `/resources/${resourceId}`,
          read: false,
          archived: false,
          createdAt: FieldValue.serverTimestamp(),
        },
      );
    }
  });
  return {
    bytes,
    fileName: String(data.fileName),
    contentType: String(data.fileType),
  };
}

export async function deleteResource(
  uid: string,
  resourceId: string,
): Promise<void> {
  const db = adminDb();
  const resourceRef = db.doc(`resources/${resourceId}`);
  const resource = await resourceRef.get();
  if (!resource.exists) throw new ResourceActionError("not-found");
  const data = resource.data()!;
  if (data.authorId !== uid) throw new ResourceActionError("not-owner");
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(resourceRef);
    if (!current.exists || current.data()?.authorId !== uid)
      throw new ResourceActionError("not-owner");
    transaction.delete(resourceRef);
    if (current.data()?.status === "active")
      transaction.update(db.doc(`users/${uid}`), {
        resourceCount: FieldValue.increment(-1),
      });
    else {
      const usageRef = db.doc(`usage/${uid}_${current.data()?.usagePeriod}`);
      const usage = await transaction.get(usageRef);
      transaction.set(
        usageRef,
        {
          resourceUploads: Math.max(
            0,
            number(usage.data()?.resourceUploads) - 1,
          ),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  });
  const reviews = await db
    .collection("resourceReviews")
    .where("resourceId", "==", resourceId)
    .get();
  const writer = db.bulkWriter();
  reviews.docs.forEach((review) => writer.delete(review.ref));
  await writer.close();
  await adminStorage()
    .bucket()
    .deleteFiles({ prefix: `resources/${uid}/${resourceId}/` });
}
