import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  prepareCommunityNotifications,
  writeCommunityNotification,
} from "@/lib/notifications/delivery";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { writePublicActivity } from "@/lib/feed/server";
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
import { resourceMetadataSchema } from "@/schemas/resource";

const RESOURCE_LIMIT = 100;
const GENERATED_RESOURCE_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// Keep a retry marker beyond the Storage client's bounded upload retries. A
// cancelled upload can finish remotely after the process handling it has gone.
const GENERATED_WRITE_GRACE_MS = 15 * 60 * 1000;
const GENERATED_CLEANUP_BATCH = 10;

export type GeneratedResourceMetadata = Omit<
  ReserveResourceInput,
  "draftResourceId" | "fileName" | "fileType" | "fileSize"
>;

export interface GeneratedResourceReservation {
  resourceId: string;
  uploadPath: string;
  state: "uploading" | "active";
}

/** Internal hooks only. Complete every transaction read in beforeCommit. */
export interface ResourceFinalizationHooks {
  beforeCommit: (transaction: FirebaseFirestore.Transaction) => Promise<void>;
  onCommit?: (
    transaction: FirebaseFirestore.Transaction,
    resourceId: string,
  ) => void;
}

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
  sourceLessonId: string | null;
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

export interface IncompleteResource {
  id: string;
  title: string;
  description: string;
  tags: string[];
  sourcePostId: string;
  createdAt: string;
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

function periodKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function extensionForMime(mime: ReserveResourceInput["fileType"]): string {
  const extensions: Record<ReserveResourceInput["fileType"], string> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "pptx",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
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

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function generatedReceiptRef(uid: string, resourceId: string) {
  const match = /^generated_([a-f0-9]{64})$/.exec(resourceId);
  return match
    ? adminDb().doc(`users/${uid}/generatedResourcePublications/${match[1]}`)
    : null;
}

function liveGeneratedWriters(data: FirebaseFirestore.DocumentData) {
  const writers: Record<string, Timestamp> = {};
  if (data.writeClaims && typeof data.writeClaims === "object") {
    for (const [claim, until] of Object.entries(data.writeClaims))
      if (until instanceof Timestamp && until.toMillis() > Date.now())
        writers[claim] = until;
  } else if (
    data.writeUntil instanceof Timestamp &&
    data.writeUntil.toMillis() > Date.now()
  ) {
    // Preserve a pre-claim upload lease during an in-place deployment.
    writers.legacy = data.writeUntil;
  }
  return writers;
}

function generatedWriteUntil(writers: Record<string, Timestamp>) {
  return Timestamp.fromMillis(
    Math.max(0, ...Object.values(writers).map((until) => until.toMillis())),
  );
}

function uploadingResourceData(
  uid: string,
  input: ReserveResourceInput,
  uploadPath: string,
  period: string,
) {
  return {
    authorId: uid,
    title: input.title,
    titleLower: input.title.toLocaleLowerCase("en-US"),
    description: input.description,
    type: input.type,
    subject: input.subject,
    subjectLower: input.subject.toLocaleLowerCase("en-US"),
    gradeLevel: input.gradeLevel,
    tags: [...new Set(input.tags.map((tag) => tag.toLocaleLowerCase("en-US")))],
    accessTier: "free",
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
    completionStatus: "complete",
    usagePeriod: period,
    updatedAt: FieldValue.serverTimestamp(),
  };
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
    sourceLessonId:
      typeof data.sourceLessonId === "string" ? data.sourceLessonId : null,
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
  const resourceRef = input.draftResourceId
    ? db.doc(`resources/${input.draftResourceId}`)
    : db.collection("resources").doc();
  const period = periodKey();
  const usageRef = db.doc(`usage/${uid}_${period}`);
  const uploadPath = `resources/${uid}/${resourceRef.id}/resource.${extensionForMime(input.fileType)}`;
  let uploadsRemaining: number | null = null;

  await db.runTransaction(async (transaction) => {
    const [user, usage, draft] = await transaction.getAll(
      db.doc(`users/${uid}`),
      usageRef,
      resourceRef,
    );
    const uploads = number(usage.data()?.resourceUploads);
    const decision = canReserveResource({
      status: user.data()?.status ?? "deleted",
    });
    if (!decision.allowed) throw new ResourceActionError(decision.reason);
    if (input.draftResourceId) {
      if (!draft.exists) throw new ResourceActionError("not-found");
      if (draft.data()?.authorId !== uid)
        throw new ResourceActionError("not-owner");
      if (
        draft.data()?.status !== "draft" ||
        draft.data()?.completionStatus !== "incomplete"
      )
        throw new ResourceActionError("not-ready");
    }
    uploadsRemaining = null;
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
    const resourceData = uploadingResourceData(uid, input, uploadPath, period);
    if (input.draftResourceId) transaction.update(resourceRef, resourceData);
    else
      transaction.create(resourceRef, {
        ...resourceData,
        createdAt: FieldValue.serverTimestamp(),
      });
  });

  return { resourceId: resourceRef.id, uploadPath, uploadsRemaining };
}

/**
 * Reserves one immutable server-generated copy per private publication intent.
 * The private receipt survives resource removal, so retries cannot republish it.
 */
export async function reserveGeneratedResource(
  uid: string,
  input: {
    publicationId: string;
    metadata: GeneratedResourceMetadata;
    bytesHash: string;
    byteLength: number;
  },
  hooks?: ResourceFinalizationHooks,
): Promise<GeneratedResourceReservation> {
  const parsed = resourceMetadataSchema.safeParse(input.metadata);
  if (
    !parsed.success ||
    !input.publicationId ||
    input.publicationId.length > 200 ||
    !/^[a-f0-9]{64}$/.test(input.bytesHash) ||
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength <= 0 ||
    input.byteLength > 25 * 1024 * 1024
  )
    throw new ResourceActionError("invalid-upload");

  const metadata = {
    ...parsed.data,
    accessTier: "free" as const,
    tags: [
      ...new Set(parsed.data.tags.map((tag) => tag.toLocaleLowerCase("en-US"))),
    ],
  };
  const intentHash = sha256(
    JSON.stringify({
      metadata,
      bytesHash: input.bytesHash,
      byteLength: input.byteLength,
    }),
  );
  const key = sha256(JSON.stringify([uid, input.publicationId]));
  const db = adminDb();
  const resourceRef = db.doc(`resources/generated_${key}`);
  const receiptRef = db.doc(
    `users/${uid}/generatedResourcePublications/${key}`,
  );
  const uploadPath = `resources/${uid}/${resourceRef.id}/resource.docx`;
  const period = periodKey();
  const usageRef = db.doc(`usage/${uid}_${period}`);

  return db.runTransaction(async (transaction) => {
    const [user, usage, receipt, resource] = await transaction.getAll(
      db.doc(`users/${uid}`),
      usageRef,
      receiptRef,
      resourceRef,
    );
    const decision = canReserveResource({
      status: user.data()?.status ?? "deleted",
    });
    if (!decision.allowed) throw new ResourceActionError(decision.reason);
    if (receipt.exists) {
      if (receipt.data()?.intentHash !== intentHash)
        throw new ResourceActionError("invalid-upload");
      const data = resource.data();
      if (!resource.exists) throw new ResourceActionError("not-ready");
      if (data?.authorId !== uid) throw new ResourceActionError("not-owner");
      if (
        data?.generatedPublicationId !== input.publicationId ||
        data?.generatedBytesHash !== input.bytesHash ||
        data?.fileSize !== input.byteLength ||
        data?.filePath !== uploadPath ||
        (data?.status !== "uploading" && data?.status !== "active")
      )
        throw new ResourceActionError("not-ready");
      await hooks?.beforeCommit(transaction);
      hooks?.onCommit?.(transaction, resourceRef.id);
      return {
        resourceId: resourceRef.id,
        uploadPath,
        state: data.status as "uploading" | "active",
      };
    }
    if (resource.exists) throw new ResourceActionError("not-ready");
    await hooks?.beforeCommit(transaction);
    const fileName = `${metadata.title.replace(/[\\/:*?"<>|\p{Cc}]/gu, "_")}.docx`;
    transaction.create(resourceRef, {
      ...uploadingResourceData(
        uid,
        {
          ...metadata,
          fileName,
          fileType: GENERATED_RESOURCE_MIME,
          fileSize: input.byteLength,
        },
        uploadPath,
        period,
      ),
      generatedPublicationId: input.publicationId,
      generatedBytesHash: input.bytesHash,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(receiptRef, {
      resourceId: resourceRef.id,
      intentHash,
      cleanupPending: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(
      usageRef,
      {
        uid,
        period,
        resourceUploads: number(usage.data()?.resourceUploads) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    hooks?.onCommit?.(transaction, resourceRef.id);
    return { resourceId: resourceRef.id, uploadPath, state: "uploading" };
  });
}

/** Writes only the exact DOCX bytes recorded by an internal reservation. */
export async function saveGeneratedResourceBytes(
  uid: string,
  resourceId: string,
  bytes: Buffer,
): Promise<void> {
  const db = adminDb();
  const resourceRef = db.doc(`resources/${resourceId}`);
  const receiptRef = generatedReceiptRef(uid, resourceId);
  if (!receiptRef) throw new ResourceActionError("not-ready");
  const writeClaim = randomUUID();
  const data = await db.runTransaction(async (transaction) => {
    const [resource, user, receipt] = await transaction.getAll(
      resourceRef,
      db.doc(`users/${uid}`),
      receiptRef,
    );
    if (!resource.exists) throw new ResourceActionError("not-found");
    const data = resource.data()!;
    if (data.authorId !== uid) throw new ResourceActionError("not-owner");
    if (user.data()?.status !== "active")
      throw new ResourceActionError("inactive");
    if (
      data.status !== "uploading" ||
      typeof data.generatedPublicationId !== "string" ||
      data.fileType !== GENERATED_RESOURCE_MIME ||
      data.filePath !== `resources/${uid}/${resourceId}/resource.docx` ||
      receipt.data()?.resourceId !== resourceId ||
      receipt.data()?.cleanupPending === true
    )
      throw new ResourceActionError("not-ready");
    if (
      bytes.length !== data.fileSize ||
      sha256(bytes) !== data.generatedBytesHash
    )
      throw new ResourceActionError("invalid-upload");
    const writeClaims = liveGeneratedWriters(receipt.data()!);
    writeClaims[writeClaim] = Timestamp.fromMillis(
      Date.now() + GENERATED_WRITE_GRACE_MS,
    );
    transaction.update(receiptRef, {
      writeClaims,
      writeUntil: generatedWriteUntil(writeClaims),
    });
    return data;
  });
  const file = adminStorage().bucket().file(data.filePath);
  let uploadConfirmed = false;
  try {
    try {
      await file.save(bytes, {
        resumable: false,
        timeout: 30_000,
        contentType: GENERATED_RESOURCE_MIME,
        metadata: { cacheControl: "private, no-store" },
      });
      uploadConfirmed = true;
    } catch (error) {
      if (!(await resourceRef.get()).exists)
        await cancelResourceUpload(uid, resourceId);
      throw error;
    }
    const current = await resourceRef.get();
    if (
      !current.exists ||
      current.data()?.authorId !== uid ||
      current.data()?.generatedBytesHash !== data.generatedBytesHash ||
      (current.data()?.status !== "uploading" &&
        current.data()?.status !== "active")
    ) {
      // Cancellation records a durable retry before trying Storage. Do not lose
      // the cleanup handle if deletion fails or another upload is still in flight.
      await cancelResourceUpload(uid, resourceId);
      throw new ResourceActionError("not-ready");
    }
  } finally {
    // An ambiguous network failure may still commit remotely. Preserve its
    // bounded grace; only confirmed completed uploads can release it early.
    if (uploadConfirmed)
      await db.runTransaction(async (transaction) => {
        const receipt = await transaction.get(receiptRef);
        if (!receipt.exists || receipt.data()?.resourceId !== resourceId)
          return;
        const writeClaims = liveGeneratedWriters(receipt.data()!);
        delete writeClaims[writeClaim];
        transaction.update(receiptRef, {
          writeClaims,
          writeUntil: generatedWriteUntil(writeClaims),
        });
      });
  }
}

export async function finalizeResourceUpload(
  uid: string,
  resourceId: string,
  hooks?: ResourceFinalizationHooks,
): Promise<void> {
  const db = adminDb();
  const resourceRef = db.doc(`resources/${resourceId}`);
  const resource = await resourceRef.get();
  if (!resource.exists) throw new ResourceActionError("not-found");
  const data = resource.data()!;
  if (data.authorId !== uid) throw new ResourceActionError("not-owner");
  const generated = typeof data.generatedPublicationId === "string";
  if (
    (generated && !hooks) ||
    (data.status !== "uploading" && !(generated && data.status === "active"))
  )
    throw new ResourceActionError("not-ready");

  let metadata;
  try {
    [metadata] = await adminStorage()
      .bucket()
      .file(String(data.filePath))
      .getMetadata();
  } catch {
    if (!generated) await cancelResourceUpload(uid, resourceId);
    throw new ResourceActionError("invalid-upload");
  }
  if (
    metadata.contentType !== data.fileType ||
    Number(metadata.size) !== data.fileSize ||
    Number(metadata.size) > 25 * 1024 * 1024
  ) {
    if (!generated) {
      await adminStorage()
        .bucket()
        .file(String(data.filePath))
        .delete({ ignoreNotFound: true });
      await cancelResourceUpload(uid, resourceId);
    }
    throw new ResourceActionError("invalid-upload");
  }
  if (generated) {
    let storedBytes: Buffer;
    try {
      [storedBytes] = await adminStorage()
        .bucket()
        .file(String(data.filePath))
        .download();
    } catch {
      throw new ResourceActionError("invalid-upload");
    }
    if (sha256(storedBytes) !== data.generatedBytesHash)
      throw new ResourceActionError("invalid-upload");
  }

  await db.runTransaction(async (transaction) => {
    const [current, user] = await transaction.getAll(
      resourceRef,
      db.doc(`users/${uid}`),
    );
    if (!current.exists || current.data()?.authorId !== uid)
      throw new ResourceActionError("not-owner");
    if (user.data()?.status !== "active")
      throw new ResourceActionError("inactive");
    if (
      current.data()?.filePath !== data.filePath ||
      current.data()?.fileType !== data.fileType ||
      current.data()?.fileSize !== data.fileSize ||
      current.data()?.generatedBytesHash !== data.generatedBytesHash ||
      (current.data()?.status !== "uploading" &&
        !(generated && current.data()?.status === "active"))
    )
      throw new ResourceActionError("not-ready");
    await hooks?.beforeCommit(transaction);
    if (current.data()?.status === "active") {
      hooks?.onCommit?.(transaction, resourceId);
      return;
    }
    transaction.update(resourceRef, {
      status: "active",
      moderationStatus: "approved",
      completionStatus: "complete",
      updatedAt: FieldValue.serverTimestamp(),
    });
    writePublicActivity(transaction, {
      authorId: uid,
      kind: "resource-published",
      entityId: resourceId,
      label: "Published a resource",
      title: String(current.data()?.title ?? "Classroom resource"),
      href: `/resources/${resourceId}`,
      tags: stringArray(current.data()?.tags),
    });
    transaction.update(db.doc(`users/${uid}`), {
      resourceCount: FieldValue.increment(1),
    });
    hooks?.onCommit?.(transaction, resourceId);
  });
}

export async function cancelResourceUpload(
  uid: string,
  resourceId: string,
): Promise<void> {
  const db = adminDb();
  const resourceRef = db.doc(`resources/${resourceId}`);
  const possibleReceiptRef = generatedReceiptRef(uid, resourceId);
  let filePath = "";
  let generated = false;
  await db.runTransaction(async (transaction) => {
    const resource = await transaction.get(resourceRef);
    if (!resource.exists) {
      const receipt = possibleReceiptRef
        ? await transaction.get(possibleReceiptRef)
        : null;
      if (!receipt?.exists || receipt.data()?.resourceId !== resourceId)
        throw new ResourceActionError("not-found");
      generated = true;
      filePath = `resources/${uid}/${resourceId}/resource.docx`;
      transaction.update(possibleReceiptRef!, {
        cleanupPending: true,
        cleanupUpdatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }
    const data = resource.data()!;
    if (data.authorId !== uid) throw new ResourceActionError("not-owner");
    if (data.status !== "uploading") throw new ResourceActionError("not-ready");
    filePath = String(data.filePath);
    generated = typeof data.generatedPublicationId === "string";
    const usageRef = db.doc(`usage/${uid}_${data.usagePeriod}`);
    const [usage, receipt] = await transaction.getAll(
      usageRef,
      ...(generated && possibleReceiptRef ? [possibleReceiptRef] : []),
    );
    if (generated) {
      if (!possibleReceiptRef || receipt?.data()?.resourceId !== resourceId)
        throw new ResourceActionError("not-ready");
      transaction.update(possibleReceiptRef, {
        cleanupPending: true,
        cleanupUpdatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.set(
      usageRef,
      {
        resourceUploads: Math.max(0, number(usage.data()?.resourceUploads) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    if (typeof data.sourcePostId === "string")
      transaction.update(resourceRef, {
        status: "draft",
        moderationStatus: "pending",
        completionStatus: "incomplete",
        filePath: FieldValue.delete(),
        fileName: FieldValue.delete(),
        fileType: FieldValue.delete(),
        fileSize: FieldValue.delete(),
        usagePeriod: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    else transaction.delete(resourceRef);
  });
  if (generated) {
    // Firestore removal and the receipt above commit together. Storage failures
    // leave the private marker for the next authenticated cleanup drain.
    await cleanupGeneratedResourceFile(uid, resourceId);
    return;
  }
  if (filePath)
    await adminStorage()
      .bucket()
      .file(filePath)
      .delete({ ignoreNotFound: true });
}

async function cleanupGeneratedResourceFile(
  uid: string,
  resourceId: string,
): Promise<boolean> {
  const db = adminDb();
  const receiptRef = generatedReceiptRef(uid, resourceId);
  if (!receiptRef) return false;
  const resourceRef = db.doc(`resources/${resourceId}`);
  const [resource, receipt] = await db.getAll(resourceRef, receiptRef);
  if (
    resource.exists ||
    receipt.data()?.resourceId !== resourceId ||
    receipt.data()?.cleanupPending !== true
  )
    return false;
  try {
    await adminStorage()
      .bucket()
      .file(`resources/${uid}/${resourceId}/resource.docx`)
      .delete({ ignoreNotFound: true });
  } catch {
    return false;
  }
  return db.runTransaction(async (transaction) => {
    const [currentResource, currentReceipt] = await transaction.getAll(
      resourceRef,
      receiptRef,
    );
    if (
      currentResource.exists ||
      !currentReceipt.exists ||
      currentReceipt.data()?.resourceId !== resourceId
    )
      return false;
    const writeUntil = currentReceipt.data()?.writeUntil;
    if (writeUntil instanceof Timestamp && writeUntil.toMillis() > Date.now())
      return false;
    transaction.update(receiptRef, {
      cleanupPending: false,
      cleanupUpdatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

/**
 * Retry one bounded batch after an authenticated action; no background worker is
 * required. A completed upload can leave its marker during the write grace.
 */
export async function drainGeneratedResourceCleanup(
  uid: string,
): Promise<number> {
  const receipts = await adminDb()
    .collection(`users/${uid}/generatedResourcePublications`)
    .where("cleanupPending", "==", true)
    .limit(GENERATED_CLEANUP_BATCH)
    .get();
  const attempts = await Promise.allSettled(
    receipts.docs.map((receipt) =>
      cleanupGeneratedResourceFile(
        uid,
        String(receipt.data().resourceId ?? ""),
      ),
    ),
  );
  return attempts.filter(
    (result) => result.status === "fulfilled" && result.value,
  ).length;
}

export async function listResources(
  query: ResourceQuery,
  viewerUid?: string,
): Promise<ResourceSummary[]> {
  const db = adminDb();
  const snapshots = await Promise.all([
    db
      .collection("resources")
      .where("status", "==", "active")
      .where("moderationStatus", "==", "approved")
      .limit(RESOURCE_LIMIT)
      .get(),
    ...(viewerUid
      ? [
          db
            .collection("resources")
            .where("authorId", "==", viewerUid)
            .limit(RESOURCE_LIMIT)
            .get(),
        ]
      : []),
  ]);
  const documents = Array.from(
    new Map(
      snapshots.flatMap((snapshot) =>
        snapshot.docs.map((document) => [document.id, document] as const),
      ),
    ).values(),
  ).filter(
    (document) =>
      document.data().status === "active" &&
      document.data().moderationStatus === "approved",
  );
  const authorIds = [
    ...new Set(documents.map((doc) => String(doc.data().authorId))),
  ];
  const authors = authorIds.length
    ? await db.getAll(...authorIds.map((uid) => db.doc(`users/${uid}`)))
    : [];
  const authorMap = new Map(
    authors.map((author) => [author.id, author.data()]),
  );
  const needle = query.query.toLocaleLowerCase("en-US");
  const resources = documents
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

export async function listOwnedResources(
  uid: string,
): Promise<ResourceSummary[]> {
  const db = adminDb();
  const [snapshot, owner] = await Promise.all([
    db
      .collection("resources")
      .where("authorId", "==", uid)
      .limit(RESOURCE_LIMIT)
      .get(),
    db.doc(`users/${uid}`).get(),
  ]);
  return snapshot.docs
    .filter(
      (document) =>
        document.data().status === "active" &&
        document.data().moderationStatus === "approved",
    )
    .map((document) => summary(document.id, document.data(), owner.data()))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listIncompleteResources(
  uid: string,
): Promise<IncompleteResource[]> {
  const snapshot = await adminDb()
    .collection("resources")
    .where("authorId", "==", uid)
    .limit(RESOURCE_LIMIT)
    .get();
  return snapshot.docs
    .filter(
      (document) =>
        document.data().status === "draft" &&
        document.data().completionStatus === "incomplete" &&
        typeof document.data().sourcePostId === "string",
    )
    .map((document) => ({
      id: document.id,
      title: String(document.data().title ?? "Untitled resource"),
      description: String(document.data().description ?? ""),
      tags: stringArray(document.data().tags),
      sourcePostId: String(document.data().sourcePostId),
      createdAt: timestamp(document.data().createdAt),
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getResourceDetail(
  resourceId: string,
  viewerUid: string,
): Promise<{ resource: ResourceDetail; reviews: ResourceReview[] } | null> {
  const db = adminDb();
  const [resourceSnapshot, viewerSnapshot, reviewSnapshots] = await Promise.all(
    [
      db.doc(`resources/${resourceId}`).get(),
      db.doc(`users/${viewerUid}`).get(),
      db
        .collection("resourceReviews")
        .where("resourceId", "==", resourceId)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get(),
    ],
  );
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
  const access = canDownloadResource({
    status: viewerSnapshot.data()?.status ?? "deleted",
  });
  return {
    resource: {
      ...summary(
        resourceSnapshot.id,
        data,
        authorMap.get(String(data.authorId)),
      ),
      fileName: typeof data.fileName === "string" ? data.fileName : "",
      fileType: typeof data.fileType === "string" ? data.fileType : "",
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
      accessTier: "free",
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
  const [resource, user] = await Promise.all([
    resourceRef.get(),
    db.doc(`users/${uid}`).get(),
  ]);
  if (!resource.exists || resource.data()?.status !== "active")
    throw new ResourceActionError("not-found");
  const data = resource.data()!;
  if (typeof data.sourceLessonId === "string")
    throw new ResourceActionError("not-ready");
  const decision = canDownloadResource({
    status: user.data()?.status ?? "deleted",
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
    const [currentResource, currentUser, currentUsage] =
      await transaction.getAll(resourceRef, db.doc(`users/${uid}`), usageRef);
    if (!currentResource.exists || currentResource.data()?.status !== "active")
      throw new ResourceActionError("not-found");
    const ownsResource = currentResource.data()?.authorId === uid;
    const downloads = number(currentUsage.data()?.resourceDownloads);
    const currentDecision = canDownloadResource({
      status: currentUser.data()?.status ?? "deleted",
    });
    if (!currentDecision.allowed)
      throw new ResourceActionError(currentDecision.reason);
    const recipients = await prepareCommunityNotifications(transaction, uid, [
      String(currentResource.data()?.authorId ?? ""),
    ]);
    if (!ownsResource) {
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
    const ownerId = String(currentResource.data()?.authorId ?? "");
    if (!ownsResource && ownerId) {
      transaction.update(resourceRef, {
        downloadCount: FieldValue.increment(1),
      });
      writeCommunityNotification(transaction, recipients, {
        recipientId: ownerId,
        id: `resource-download_${resourceId}_${uid}`,
        type: "resource-download",
        actorId: uid,
        actorName: String(currentUser.data()?.displayName ?? "An educator"),
        entityId: resourceId,
        message: `${String(currentUser.data()?.displayName ?? "An educator")} downloaded your resource.`,
        href: `/resources/${resourceId}`,
      });
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
  const sourceLessonId =
    typeof data.sourceLessonId === "string" ? data.sourceLessonId : null;
  const usageRef =
    data.status === "uploading" && typeof data.usagePeriod === "string"
      ? db.doc(`usage/${uid}_${data.usagePeriod}`)
      : null;
  await db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(
      resourceRef,
      ...(sourceLessonId ? [db.doc(`lessons/${sourceLessonId}`)] : []),
      ...(usageRef ? [usageRef] : []),
    );
    const [current, linkedLesson, usage] = snapshots;
    if (!current.exists || current.data()?.authorId !== uid)
      throw new ResourceActionError("not-owner");
    transaction.delete(resourceRef);
    if (current.data()?.status === "active")
      transaction.update(db.doc(`users/${uid}`), {
        resourceCount: FieldValue.increment(-1),
      });
    else if (usageRef) {
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
    if (sourceLessonId && linkedLesson?.exists) {
      transaction.update(linkedLesson.ref, {
        visibility: "draft",
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.delete(
        db.doc(`posts/activity_lesson-published_${sourceLessonId}`),
      );
    } else {
      transaction.delete(
        db.doc(`posts/activity_resource-published_${resourceId}`),
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
