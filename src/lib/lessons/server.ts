import "server-only";
import { deleteTeachingExports } from "@/lib/teaching-exports/cleanup";

import { createHash, randomUUID } from "node:crypto";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  PLAN_ENTITLEMENTS,
  resolveEffectivePlan,
} from "@/lib/entitlements/plan-entitlements";
import { adminDb } from "@/lib/firebase/admin";
import { AiSpendError, reserve, abandonBestEffort } from "@/lib/ai/spend";
import { publicActivityRef, writePublicActivity } from "@/lib/feed/server";
import {
  moderationStatus,
  publicResourceIds,
  retainModeration,
  type ModerationStatus,
} from "@/lib/community/visibility";
import {
  generateLessonPlan,
  prepareLessonResponse,
  type LessonGenerationOptions,
} from "@/lib/lessons/provider";
import {
  lessonActionSchema,
  lessonPlanSchema,
  lessonSourceSchema,
  lessonVisibilitySchema,
  lessonRequestIdSchema,
  type LessonPlanInput,
  type LessonSourceInput,
} from "@/schemas/lesson";
import {
  usageNumber as number,
  firestoreIso as iso,
  usageMonth as monthKey,
  usageSubscription as subscriptionRecord,
  generationAccessError,
} from "@/lib/ai/usage";

const LESSON_LIMIT = 100;
const VERSION_LIMIT = 30;
const WORKSPACE_PAGE_SIZE = 20;
const GENERATION_LEASE_MS = 10 * 60_000;

export interface LessonSummary {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  durationMinutes: number;
  currentVersion: number;
  visibility: "draft" | "published";
  generationStatus: "idle" | "generating";
  sampleMode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LessonVersion {
  id: string;
  version: number;
  kind: "generated" | "edited" | "duplicated" | "restored";
  createdAt: string;
}

export interface LessonDetail extends LessonSummary {
  source: LessonSourceInput;
  content: LessonPlanInput;
  versions: LessonVersion[];
  moderationStatus?: ModerationStatus | null;
  publiclyAvailable?: boolean;
}

export interface SharedLesson extends LessonDetail {
  author: { uid: string; displayName: string; photoURL: string | null };
  ownedByViewer: boolean;
  moderationStatus: ModerationStatus | null;
  publiclyAvailable: boolean;
}

export interface LessonQuotaUsage {
  used: number;
  limit: number | null;
  remaining: number | null;
}

export interface LessonWorkspace {
  plan: "free" | "plus";
  usage: {
    resetsAt: string;
    used: number;
    limit: number;
    remaining: number;
    exports: LessonQuotaUsage;
  };
  lessons: LessonSummary[];
  nextCursor: string | null;
}

export class LessonActionError extends Error {
  constructor(
    public readonly code:
      | "inactive"
      | "limit-reached"
      | "rate-limited"
      | "not-found"
      | "not-owner"
      | "busy"
      | "conflict"
      | "invalid-content"
      | "invalid-cursor"
      | "generation-failed",
    message?: string,
  ) {
    super(message ?? code);
  }
}

function quota(used: number, limit: number | null): LessonQuotaUsage {
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
  };
}

function summary(
  id: string,
  data: FirebaseFirestore.DocumentData,
): LessonSummary {
  const content = lessonPlanSchema.parse(data.content);
  return {
    id,
    title: content.title,
    subject: content.subject,
    gradeLevel: content.gradeLevel,
    durationMinutes: content.durationMinutes,
    currentVersion: number(data.currentVersion),
    visibility: lessonVisibilitySchema.safeParse(data.visibility).success
      ? data.visibility
      : "published",
    generationStatus:
      data.generationStatus === "generating" ? "generating" : "idle",
    sampleMode: data.sampleMode === true,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

function lessonResourceData(
  ownerId: string,
  lessonId: string,
  content: LessonPlanInput,
) {
  return {
    authorId: ownerId,
    sourceLessonId: lessonId,
    title: content.title,
    titleLower: content.title.toLocaleLowerCase("en-US"),
    description:
      content.objectives.join(" ").slice(0, 2_000) ||
      `A ${content.durationMinutes}-minute ${content.subject} lesson plan.`,
    type: "lesson-plan",
    subject: content.subject,
    subjectLower: content.subject.toLocaleLowerCase("en-US"),
    gradeLevel: content.gradeLevel,
    tags: ["lesson-plan", content.subject.toLocaleLowerCase("en-US")],
    accessTier: "free",
    filePath: null,
    fileName: null,
    fileType: null,
    fileSize: 0,
    thumbnailURL: null,
    status: "active",
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function ensurePublishedLessonResources(
  uid: string,
): Promise<void> {
  const db = adminDb();
  const userRef = db.doc(`users/${uid}`);
  const user = await userRef.get();
  if (!user.exists || user.data()?.publishedLessonResourcesBackfilledAt) return;

  const lessons = await db
    .collection("lessons")
    .where("ownerId", "==", uid)
    .limit(LESSON_LIMIT)
    .get();
  const candidates = lessons.docs.filter(
    (lesson) =>
      lesson.data().visibility === "published" && lesson.data().content,
  );
  const lessonRefs = candidates.map((lesson) => lesson.ref);
  const resourceRefs = candidates.map((lesson) =>
    db.doc(`resources/lesson_${lesson.id}`),
  );
  const activityRefs = candidates.map((lesson) =>
    publicActivityRef({ kind: "lesson-published", entityId: lesson.id }),
  );

  await db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(
      userRef,
      ...lessonRefs,
      ...resourceRefs,
      ...activityRefs,
    );
    const currentUser = snapshots[0];
    if (
      !currentUser.exists ||
      currentUser.data()?.publishedLessonResourcesBackfilledAt
    )
      return;

    const currentLessons = snapshots.slice(1, 1 + lessonRefs.length);
    const currentResources = snapshots.slice(
      1 + lessonRefs.length,
      1 + lessonRefs.length + resourceRefs.length,
    );
    const currentActivities = snapshots.slice(
      1 + lessonRefs.length + resourceRefs.length,
    );
    let activatedResources = 0;

    currentLessons.forEach((lesson, index) => {
      const data = lesson.data();
      const parsedContent = lessonPlanSchema.safeParse(data?.content);
      if (
        !lesson.exists ||
        data?.ownerId !== uid ||
        data.visibility !== "published" ||
        !parsedContent.success
      )
        return;

      const resource = currentResources[index];
      if (resource?.exists && resource.data()?.status === "active") return;

      transaction.set(
        resourceRefs[index],
        {
          ...lessonResourceData(uid, lesson.id, parsedContent.data),
          moderationStatus: retainModeration(resource?.data(), "approved"),
          ...(resource?.exists
            ? {}
            : {
                downloadCount: 0,
                ratingTotal: 0,
                ratingAverage: 0,
                ratingCount: 0,
                createdAt:
                  data.publishedAt ??
                  data.updatedAt ??
                  FieldValue.serverTimestamp(),
              }),
        },
        { merge: true },
      );
      if (retainModeration(resource?.data(), "approved") === "approved")
        writePublicActivity(
          transaction,
          {
            authorId: uid,
            kind: "lesson-published",
            entityId: lesson.id,
            label: "Published a lesson plan",
            title: parsedContent.data.title,
            href: `/lessons/${lesson.id}`,
            tags: ["lesson-plan", parsedContent.data.subject],
          },
          currentActivities[index],
        );
      activatedResources += 1;
    });

    transaction.set(
      userRef,
      {
        publishedLessonResourcesBackfilledAt: FieldValue.serverTimestamp(),
        ...(activatedResources
          ? { resourceCount: FieldValue.increment(activatedResources) }
          : {}),
      },
      { merge: true },
    );
  });
}

async function currentPlan(uid: string) {
  const snapshot = await adminDb().doc(`subscriptions/${uid}`).get();
  return resolveEffectivePlan(subscriptionRecord(snapshot.data()));
}

export async function getLessonWorkspace(
  uid: string,
  cursor?: string,
): Promise<LessonWorkspace> {
  const db = adminDb();
  if ((await db.doc(`users/${uid}`).get()).data()?.status !== "active")
    throw new LessonActionError("inactive");
  await recoverStaleLessonGenerations(uid);
  let query = db
    .collection("lessons")
    .where("ownerId", "==", uid)
    .orderBy("updatedAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (cursor) {
    const previous = await db.doc(`lessons/${cursor}`).get();
    if (!previous.exists || previous.data()?.ownerId !== uid)
      throw new LessonActionError("invalid-cursor");
    query = query.startAfter(previous);
  }
  const period = monthKey();
  const [plan, usage, lessons] = await Promise.all([
    currentPlan(uid),
    db.doc(`usage/${uid}_${period}`).get(),
    query.limit(WORKSPACE_PAGE_SIZE + 1).get(),
  ]);
  const used = number(usage.data()?.aiLessons);
  const entitlements = PLAN_ENTITLEMENTS[plan];
  return {
    plan,
    usage: {
      resetsAt: new Date(
        Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1),
      ).toISOString(),
      used,
      limit: entitlements.aiLessonsPerMonth,
      remaining: Math.max(0, entitlements.aiLessonsPerMonth - used),
      exports: quota(
        number(usage.data()?.lessonExports),
        entitlements.lessonExportsPerMonth,
      ),
    },
    lessons: lessons.docs
      .slice(0, WORKSPACE_PAGE_SIZE)
      .filter((document) => document.data().content)
      .map((document) => summary(document.id, document.data())),
    nextCursor:
      lessons.size > WORKSPACE_PAGE_SIZE
        ? lessons.docs[WORKSPACE_PAGE_SIZE - 1].id
        : null,
  };
}

export async function getLesson(
  uid: string,
  lessonId: string,
): Promise<LessonDetail> {
  const db = adminDb();
  const lessonRef = db.doc(`lessons/${lessonId}`);
  const [initialLesson, versions, user, resource] = await Promise.all([
    lessonRef.get(),
    lessonRef
      .collection("versions")
      .orderBy("version", "desc")
      .limit(VERSION_LIMIT)
      .get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`resources/lesson_${lessonId}`).get(),
  ]);
  if (user.data()?.status !== "active") throw new LessonActionError("inactive");
  let lesson = initialLesson;
  if (!lesson.exists) throw new LessonActionError("not-found");
  let data = lesson.data()!;
  if (data.ownerId !== uid) throw new LessonActionError("not-owner");
  if (
    data.generationStatus === "generating" &&
    data.updatedAt instanceof Timestamp &&
    data.updatedAt.toMillis() + GENERATION_LEASE_MS <= Date.now()
  ) {
    if (typeof data.generationRequestId === "string")
      await failGeneration(
        uid,
        data.generationRequestId,
        "expired",
        new Date(),
      );
    else await recoverStaleLessonGenerations(uid);
    lesson = await lessonRef.get();
    if (!lesson.exists) throw new LessonActionError("not-found");
    data = lesson.data()!;
  }
  if (!data.content) throw new LessonActionError("busy");
  return {
    ...summary(lesson.id, data),
    source: lessonSourceSchema.parse(data.source),
    content: lessonPlanSchema.parse(data.content),
    moderationStatus: moderationStatus(resource.data()),
    publiclyAvailable: (await publicResourceIds([resource])).has(resource.id),
    versions: versions.docs.map((document) => ({
      id: document.id,
      version: number(document.data().version),
      kind:
        document.data().kind === "edited" ||
        document.data().kind === "duplicated" ||
        document.data().kind === "restored"
          ? document.data().kind
          : "generated",
      createdAt: iso(document.data().createdAt),
    })),
  };
}

export async function getSharedLesson(
  lessonId: string,
  viewerUid: string,
): Promise<SharedLesson | null> {
  const db = adminDb();
  const lesson = await db.doc(`lessons/${lessonId}`).get();
  if (!lesson.exists || !lesson.data()?.content) return null;
  const ownerId = String(lesson.data()?.ownerId ?? "");
  const ownedByViewer = ownerId === viewerUid;
  const resource = await db.doc(`resources/lesson_${lessonId}`).get();
  const publiclyAvailable = (await publicResourceIds([resource])).has(
    resource.id,
  );
  if (!ownedByViewer && !publiclyAvailable) return null;
  const [owner, versions] = await Promise.all([
    db.doc(`users/${ownerId}`).get(),
    ownedByViewer
      ? lesson.ref
          .collection("versions")
          .orderBy("version", "desc")
          .limit(VERSION_LIMIT)
          .get()
      : Promise.resolve(null),
  ]);
  if (!ownedByViewer && owner.data()?.status !== "active") return null;
  const data = lesson.data()!;
  const content = lessonPlanSchema.parse(data.content);
  return {
    ...summary(lesson.id, data),
    source: ownedByViewer
      ? lessonSourceSchema.parse(data.source)
      : lessonSourceSchema.parse({
          subject: content.subject,
          gradeLevel: content.gradeLevel,
          topic: content.title,
          durationMinutes: content.durationMinutes,
          teachingStyle: "balanced",
          language: data.source?.language ?? "English",
        }),
    content,
    versions:
      versions?.docs.map((document) => ({
        id: document.id,
        version: number(document.data().version),
        kind:
          document.data().kind === "edited" ||
          document.data().kind === "duplicated" ||
          document.data().kind === "restored"
            ? document.data().kind
            : "generated",
        createdAt: iso(document.data().createdAt),
      })) ?? [],
    author: {
      uid: ownerId,
      displayName: String(owner.data()?.displayName ?? "Educator"),
      photoURL:
        typeof owner.data()?.photoURL === "string"
          ? owner.data()!.photoURL
          : null,
    },
    ownedByViewer,
    moderationStatus: moderationStatus(resource.data()),
    publiclyAvailable,
  };
}

function fingerprint(value: unknown): string {
  const canonical = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(canonical)
      : input && typeof input === "object"
        ? Object.fromEntries(
            Object.entries(input)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, entry]) => [key, canonical(entry)]),
          )
        : input;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function assertExpectedVersion(
  value: number | undefined,
): asserts value is number {
  if (!Number.isInteger(value) || value! < 1)
    throw new LessonActionError("conflict");
}

function generationUsage(
  usage: FirebaseFirestore.DocumentData | undefined,
  isNew: boolean,
  delta: 1 | -1,
) {
  return {
    aiLessons: Math.max(0, number(usage?.aiLessons) + delta),
    aiLessonCreations: Math.max(
      0,
      number(usage?.aiLessonCreations) + (isNew ? delta : 0),
    ),
    aiRefinements: Math.max(
      0,
      number(usage?.aiRefinements) + (isNew ? 0 : delta),
    ),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** A pending job owns both its quota debit and the artifact mutation fence. */
async function failGeneration(
  uid: string,
  jobId: string,
  failure: string,
  onlyExpiredAt?: Date,
  expectedAttemptId?: string,
): Promise<"complete" | "failed" | "missing"> {
  const db = adminDb();
  const jobRef = db.doc(`lessonGenerationRequests/${jobId}`);
  return db.runTransaction(async (transaction) => {
    const job = await transaction.get(jobRef);
    const data = job.data();
    if (!data || data.ownerId !== uid) return "missing";
    if (expectedAttemptId && data.attemptId !== expectedAttemptId)
      return "missing";
    if (data.status === "complete") return "complete";
    if (data.status !== "pending") return "failed";
    if (
      onlyExpiredAt &&
      (!(data.expiresAt instanceof Timestamp) ||
        data.expiresAt.toMillis() > onlyExpiredAt.getTime())
    )
      return "missing";
    const usageRef = db.doc(`usage/${uid}_${data.period}`);
    const lessonRef = db.doc(`lessons/${data.lessonId}`);
    const [usage, lesson, user] = await transaction.getAll(
      usageRef,
      lessonRef,
      db.doc(`users/${uid}`),
    );
    // Account cleanup may have removed usage already. Never recreate it afterward.
    if (usage.exists && user.exists)
      transaction.update(
        usageRef,
        generationUsage(usage.data(), data.isNew === true, -1),
      );
    transaction.update(jobRef, {
      status: "failed",
      failure,
      completedAt: FieldValue.serverTimestamp(),
    });
    if (
      lesson.data()?.ownerId === uid &&
      lesson.data()?.generationRequestId === jobId &&
      lesson.data()?.generationAttemptId === data.attemptId
    ) {
      if (!lesson.data()?.content) transaction.delete(lessonRef);
      else
        transaction.update(lessonRef, {
          generationStatus: "idle",
          generationRequestId: FieldValue.delete(),
          generationAttemptId: FieldValue.delete(),
          pendingSource: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
    }
    return "failed";
  });
}

/** Recover after a terminated worker, without refunding any completed job twice. */
export async function recoverStaleLessonGenerations(
  uid: string,
  now = new Date(),
): Promise<number> {
  const db = adminDb();
  const expired = await db
    .collection("lessonGenerationRequests")
    .where("ownerId", "==", uid)
    .where("status", "==", "pending")
    .where("expiresAt", "<=", Timestamp.fromDate(now))
    .limit(50)
    .get();
  let recovered = 0;
  for (const job of expired.docs) {
    if ((await failGeneration(uid, job.id, "expired", now)) === "failed") {
      recovered++;
      await abandonBestEffort(job.data().spendAttemptId);
    }
  }
  // Old releases had no durable reservation ledger. Unlock them only after the
  // same grace period; guessing which month's quota to refund would corrupt usage.
  const legacy = await db
    .collection("lessons")
    .where("ownerId", "==", uid)
    .where("generationStatus", "==", "generating")
    .limit(50)
    .get();
  for (const candidate of legacy.docs) {
    const data = candidate.data();
    if (
      data.generationRequestId ||
      !(data.updatedAt instanceof Timestamp) ||
      data.updatedAt.toMillis() + GENERATION_LEASE_MS > now.getTime()
    )
      continue;
    const changed = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      const value = current.data();
      if (
        !value ||
        value.ownerId !== uid ||
        value.generationStatus !== "generating" ||
        value.generationRequestId ||
        !(value.updatedAt instanceof Timestamp) ||
        value.updatedAt.toMillis() + GENERATION_LEASE_MS > now.getTime()
      )
        return false;
      if (!value.content) transaction.delete(candidate.ref);
      else
        transaction.update(candidate.ref, {
          generationStatus: "idle",
          pendingSource: FieldValue.delete(),
          legacyGenerationRecoveredAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      return true;
    });
    if (changed) recovered++;
  }
  return recovered;
}

interface GenerationRequest {
  requestId: string;
  retryId?: string;
  source?: LessonSourceInput;
  lessonId?: string;
  expectedVersion?: number;
  feedback?: string;
  referenceContent?: LessonPlanInput;
  ignoreCooldown?: boolean;
  batchClaim?: { batchId: string; index: number };
}

async function runGeneration(
  uid: string,
  request: GenerationRequest,
): Promise<LessonDetail> {
  lessonRequestIdSchema.parse(request.requestId);
  if (request.retryId) lessonRequestIdSchema.parse(request.retryId);
  const db = adminDb();
  if (request.lessonId) assertExpectedVersion(request.expectedVersion);
  await recoverStaleLessonGenerations(uid);
  const now = new Date();
  const period = monthKey(now);
  const usageRef = db.doc(`usage/${uid}_${period}`);
  const jobRef = db.doc(`lessonGenerationRequests/${uid}_${request.requestId}`);
  const jobFingerprint = fingerprint({
    source: request.source ?? null,
    lessonId: request.lessonId ?? null,
    expectedVersion: request.expectedVersion ?? null,
    feedback: request.feedback?.trim() ?? "",
    referenceContent: request.referenceContent ?? null,
  });
  const previousJob = await jobRef.get();
  const lessonRef = db.doc(
    `lessons/${request.lessonId ?? previousJob.data()?.lessonId ?? randomUUID()}`,
  );
  const reservation = await db.runTransaction(async (transaction) => {
    const [user, subscription, usage, job, lesson] = await transaction.getAll(
      db.doc(`users/${uid}`),
      db.doc(`subscriptions/${uid}`),
      usageRef,
      jobRef,
      lessonRef,
    );
    if (request.batchClaim) {
      const batch = await transaction.get(
        db.doc(`lessonGenerationBatches/${request.batchClaim.batchId}`),
      );
      const item = (batch.data()?.items as BatchItemRecord[] | undefined)?.[
        request.batchClaim.index
      ];
      // A worker paused between the manifest claim and this reservation must
      // not charge after recovery replaced or expired its claim.
      if (
        batch.data()?.ownerId !== uid ||
        item?.requestId !== request.requestId ||
        item.status !== "pending" ||
        !(item.expiresAt instanceof Timestamp) ||
        item.expiresAt.toMillis() <= Date.now()
      )
        throw new LessonActionError("conflict");
    }
    if (user.data()?.status !== "active")
      throw new LessonActionError("inactive");
    if (job.exists) {
      if (job.data()?.fingerprint !== jobFingerprint)
        throw new LessonActionError("conflict");
      if (job.data()?.status === "complete")
        return {
          replay: true as const,
          lessonId: String(job.data()!.lessonId),
        };
      if (job.data()?.status === "pending") throw new LessonActionError("busy");
      if (
        !request.retryId ||
        (job.data()?.retryActions ?? []).includes(request.retryId) ||
        job.data()?.failure === "deleted"
      )
        throw new LessonActionError("generation-failed");
      if ((job.data()?.retryActions?.length ?? 0) >= 1_000)
        throw new LessonActionError("conflict");
    }
    if (request.lessonId) {
      if (!lesson.exists) throw new LessonActionError("not-found");
      if (lesson.data()?.ownerId !== uid)
        throw new LessonActionError("not-owner");
      if (lesson.data()?.generationStatus === "generating")
        throw new LessonActionError("busy");
      if (lesson.data()?.currentVersion !== request.expectedVersion)
        throw new LessonActionError("conflict");
    }
    const access = generationAccessError(
      user.data(),
      subscription.data(),
      usage.data(),
      now,
      request.ignoreCooldown,
    );
    if (access) throw new LessonActionError(access);
    const baseSource = request.source ?? lesson.data()?.source;
    const source = lessonSourceSchema.parse(
      request.referenceContent
        ? {
            ...baseSource,
            subject: request.referenceContent.subject,
            gradeLevel: request.referenceContent.gradeLevel,
            durationMinutes: request.referenceContent.durationMinutes,
          }
        : baseSource,
    );
    const previousVersion = request.lessonId
      ? number(lesson.data()?.currentVersion)
      : 0;
    const generation: LessonGenerationOptions = {
      ...(request.feedback?.trim()
        ? { feedback: request.feedback.trim() }
        : {}),
      ...(request.lessonId
        ? {
            referencePlan:
              request.referenceContent ??
              lessonPlanSchema.parse(lesson.data()?.content),
          }
        : {}),
    };
    const sampleMode = process.env.AI_PROVIDER === "MOCK";
    const attemptId = randomUUID();
    const prepared = prepareLessonResponse(source, generation);
    // ALL domain reads/replay checks above; reserve performs the last reads before writes.
    const spend = prepared
      ? await reserve(
          transaction,
          prepared.plan,
          `${jobRef.id}:${attemptId}`,
          Timestamp.fromMillis(now.getTime() + GENERATION_LEASE_MS),
        )
      : null;
    const lock = {
      generationStatus: "generating",
      generationRequestId: jobRef.id,
      generationAttemptId: attemptId,
      pendingSource: source,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (request.lessonId) transaction.update(lessonRef, lock);
    else
      transaction.create(lessonRef, {
        ...lock,
        ownerId: uid,
        source,
        content: null,
        visibility: "draft",
        status: "generating",
        currentVersion: 0,
        sampleMode,
        createdAt: FieldValue.serverTimestamp(),
      });
    transaction.set(jobRef, {
      ownerId: uid,
      fingerprint: jobFingerprint,
      lessonId: lessonRef.id,
      attemptId,
      spendAttemptId: spend?.id ?? null,
      retryActions: [
        ...(job.data()?.retryActions ?? []),
        ...(request.retryId ? [request.retryId] : []),
      ],
      status: "pending",
      period,
      isNew: !request.lessonId,
      previousVersion,
      source,
      generation,
      sampleMode,
      expiresAt: Timestamp.fromMillis(now.getTime() + GENERATION_LEASE_MS),
      createdAt: job.data()?.createdAt ?? FieldValue.serverTimestamp(),
    });
    transaction.set(
      usageRef,
      {
        uid,
        period,
        ...generationUsage(usage.data(), !request.lessonId, 1),
        lastAiLessonAt: Timestamp.fromDate(now),
      },
      { merge: true },
    );
    return {
      replay: false as const,
      lessonId: lessonRef.id,
      previousVersion,
      source,
      generation,
      sampleMode,
      attemptId,
      prepared,
      spend,
    };
  });
  if (reservation.replay) return getLesson(uid, reservation.lessonId);
  try {
    const content = await generateLessonPlan(
      reservation.source,
      reservation.generation,
      reservation.prepared && reservation.spend
        ? {
            prepared: reservation.prepared,
            spend: reservation.spend,
            fence: async (transaction) => {
              const [user, job, lesson] = await transaction.getAll(
                db.doc(`users/${uid}`),
                jobRef,
                lessonRef,
              );
              if (user.data()?.status !== "active")
                throw new LessonActionError("inactive");
              if (
                job.data()?.ownerId !== uid ||
                job.data()?.status !== "pending" ||
                job.data()?.attemptId !== reservation.attemptId ||
                job.data()?.spendAttemptId !== reservation.spend!.id ||
                lesson.data()?.ownerId !== uid ||
                lesson.data()?.generationRequestId !== jobRef.id ||
                lesson.data()?.generationAttemptId !== reservation.attemptId ||
                lesson.data()?.currentVersion !== reservation.previousVersion ||
                !(job.data()?.expiresAt instanceof Timestamp) ||
                job.data()!.expiresAt.toMillis() <= Date.now()
              )
                throw new LessonActionError("conflict");
              if (request.batchClaim) {
                const batch = await transaction.get(
                  db.doc(
                    `lessonGenerationBatches/${request.batchClaim.batchId}`,
                  ),
                );
                const item = (
                  batch.data()?.items as BatchItemRecord[] | undefined
                )?.[request.batchClaim.index];
                if (
                  batch.data()?.ownerId !== uid ||
                  item?.requestId !== request.requestId ||
                  item.status !== "pending" ||
                  !(item.expiresAt instanceof Timestamp) ||
                  item.expiresAt.toMillis() <= Date.now()
                )
                  throw new LessonActionError("conflict");
              }
            },
          }
        : undefined,
    );
    await db.runTransaction(async (transaction) => {
      const resourceRef = db.doc(`resources/lesson_${reservation.lessonId}`);
      const [user, lesson, job, resource] = await transaction.getAll(
        db.doc(`users/${uid}`),
        lessonRef,
        jobRef,
        resourceRef,
      );
      if (user.data()?.status !== "active")
        throw new LessonActionError("inactive");
      if (!lesson.exists || lesson.data()?.ownerId !== uid)
        throw new LessonActionError("not-found");
      if (
        job.data()?.status !== "pending" ||
        job.data()?.attemptId !== reservation.attemptId ||
        lesson.data()?.generationAttemptId !== reservation.attemptId ||
        lesson.data()?.generationRequestId !== jobRef.id ||
        lesson.data()?.currentVersion !== reservation.previousVersion ||
        !(job.data()?.expiresAt instanceof Timestamp) ||
        job.data()!.expiresAt.toMillis() <= Date.now()
      )
        throw new LessonActionError("conflict");
      const version = reservation.previousVersion + 1;
      transaction.update(lessonRef, {
        source: reservation.source,
        content,
        sampleMode: reservation.sampleMode,
        visibility: lessonVisibilitySchema.safeParse(lesson.data()?.visibility)
          .success
          ? lesson.data()?.visibility
          : "draft",
        status: "ready",
        generationStatus: "idle",
        generationRequestId: FieldValue.delete(),
        generationAttemptId: FieldValue.delete(),
        pendingSource: FieldValue.delete(),
        currentVersion: version,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(lessonRef.collection("versions").doc(`v${version}`), {
        ownerId: uid,
        version,
        kind: "generated",
        source: reservation.source,
        content,
        sampleMode: reservation.sampleMode,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(jobRef, {
        status: "complete",
        version,
        completedAt: FieldValue.serverTimestamp(),
      });
      if (lesson.data()?.visibility === "published") {
        transaction.set(
          resourceRef,
          {
            ...lessonResourceData(uid, reservation.lessonId, content),
            moderationStatus: retainModeration(resource.data(), "approved"),
            ...(resource.exists
              ? {}
              : {
                  downloadCount: 0,
                  ratingTotal: 0,
                  ratingAverage: 0,
                  ratingCount: 0,
                }),
            ...(resource.data()?.createdAt
              ? {}
              : { createdAt: FieldValue.serverTimestamp() }),
          },
          { merge: true },
        );
        if (!resource.exists || resource.data()?.status !== "active")
          transaction.update(user.ref, {
            resourceCount: FieldValue.increment(1),
          });
      }
    });
  } catch (error) {
    // A commit acknowledgement can fail after the write succeeded. Consult the
    // job before refunding; a completed artifact must remain charged and intact.
    if (
      (await failGeneration(
        uid,
        jobRef.id,
        error instanceof LessonActionError || error instanceof AiSpendError
          ? error.code
          : "generation-failed",
        undefined,
        reservation.attemptId,
      )) === "complete"
    )
      return getLesson(uid, reservation.lessonId);
    await abandonBestEffort(reservation.spend?.id);
    if (error instanceof LessonActionError || error instanceof AiSpendError)
      throw error;
    throw new LessonActionError("generation-failed");
  }
  // A later response read failure is outside the refundable generation section.
  return getLesson(uid, reservation.lessonId);
}

export async function createLesson(
  uid: string,
  source: LessonSourceInput,
  requestId: string = randomUUID(),
  retryId?: string,
): Promise<LessonDetail> {
  return runGeneration(uid, {
    source: lessonSourceSchema.parse(source),
    requestId,
    retryId,
  });
}

export async function regenerateLesson(
  uid: string,
  lessonId: string,
  source?: LessonSourceInput,
  feedback?: string,
  referenceContent?: LessonPlanInput,
  options?: { expectedVersion: number; requestId: string; retryId?: string },
): Promise<LessonDetail> {
  assertExpectedVersion(options?.expectedVersion);
  if (!options?.requestId) throw new LessonActionError("conflict");
  return runGeneration(uid, {
    lessonId,
    source: source ? lessonSourceSchema.parse(source) : undefined,
    feedback,
    referenceContent,
    ...options,
  });
}

export interface LessonGenerationRequestStatus {
  requestId: string;
  status: "pending" | "complete" | "failed";
  lessonId: string;
  lesson: LessonDetail | null;
  error?: string;
}
export async function getLessonGenerationRequest(
  uid: string,
  requestId: string,
): Promise<LessonGenerationRequestStatus> {
  const db = adminDb();
  if ((await db.doc(`users/${uid}`).get()).data()?.status !== "active")
    throw new LessonActionError("inactive");
  const ref = db.doc(`lessonGenerationRequests/${uid}_${requestId}`);
  let job = await ref.get();
  if (
    job.data()?.status === "pending" &&
    job.data()?.expiresAt instanceof Timestamp &&
    job.data()!.expiresAt.toMillis() <= Date.now()
  ) {
    await failGeneration(uid, ref.id, "expired", new Date());
    job = await ref.get();
  }
  const data = job.data();
  if (!data || data.ownerId !== uid) throw new LessonActionError("not-found");
  const status =
    data.status === "complete"
      ? "complete"
      : data.status === "pending"
        ? "pending"
        : "failed";
  let lesson: LessonDetail | null = null;
  if (status === "complete") {
    try {
      lesson = await getLesson(uid, String(data.lessonId));
    } catch (error) {
      if (!(error instanceof LessonActionError && error.code === "not-found"))
        throw error;
    }
  }
  return {
    requestId,
    status,
    lessonId: String(data.lessonId),
    lesson,
    ...(status === "failed"
      ? { error: String(data.failure ?? "generation-failed") }
      : {}),
  };
}

interface BatchItemRecord {
  index: number;
  requestId: string;
  attempt: number;
  status: "not-started" | "pending" | "complete" | "failed";
  lessonId: string | null;
  expiresAt?: Timestamp;
  error?: string;
}
export interface LessonBatch {
  id: string;
  requestId: string;
  source: LessonSourceInput;
  count: number;
  status: "complete" | "partial" | "pending" | "failed";
  lessons: LessonDetail[];
  items: {
    index: number;
    lessonId: string | null;
    status: BatchItemRecord["status"];
    error?: string;
  }[];
  hasMore: boolean;
}

/** Refresh a durable manifest from job outcomes; never starts another AI call. */
export async function getLessonBatch(
  uid: string,
  requestId: string,
): Promise<LessonBatch> {
  const db = adminDb();
  if ((await db.doc(`users/${uid}`).get()).data()?.status !== "active")
    throw new LessonActionError("inactive");
  await recoverStaleLessonGenerations(uid);
  const ref = db.doc(`lessonGenerationBatches/${uid}_${requestId}`);
  const data = await db.runTransaction(async (transaction) => {
    const batch = await transaction.get(ref);
    if (!batch.exists || batch.data()?.ownerId !== uid)
      throw new LessonActionError("not-found");
    const value = batch.data()!;
    const items = value.items as BatchItemRecord[];
    const jobs = await transaction.getAll(
      ...items.map((item) =>
        db.doc(`lessonGenerationRequests/${uid}_${item.requestId}`),
      ),
    );
    let changed = false;
    const next = items.map((item, index) => {
      if (item.status !== "pending") return item;
      const job = jobs[index].data();
      if (
        job?.ownerId === uid &&
        (job.status === "complete" || job.status === "failed")
      ) {
        changed = true;
        return {
          ...item,
          status: job.status as "complete" | "failed",
          lessonId: String(job.lessonId),
          ...(job.status === "failed"
            ? { error: String(job.failure ?? "generation-failed") }
            : {}),
        };
      }
      if (
        !job &&
        item.expiresAt instanceof Timestamp &&
        item.expiresAt.toMillis() <= Date.now()
      ) {
        changed = true;
        return { ...item, status: "failed" as const, error: "expired" };
      }
      return item;
    });
    if (changed)
      transaction.update(ref, {
        items: next,
        updatedAt: FieldValue.serverTimestamp(),
      });
    return { source: value.source, items: next };
  });
  const items = data.items as BatchItemRecord[];
  const lessons: LessonDetail[] = [];
  for (const item of items)
    if (item.status === "complete" && item.lessonId) {
      try {
        lessons.push(await getLesson(uid, item.lessonId));
      } catch (error) {
        if (!(error instanceof LessonActionError && error.code === "not-found"))
          throw error;
      }
    }
  const hasMore = items.some((item) => item.status === "not-started");
  const status = items.every((item) => item.status === "complete")
    ? "complete"
    : items.some((item) => item.status === "pending")
      ? "pending"
      : hasMore || items.some((item) => item.status === "complete")
        ? "partial"
        : "failed";
  return {
    id: ref.id,
    requestId,
    source: lessonSourceSchema.parse(data.source),
    count: items.length,
    status,
    lessons,
    hasMore,
    items: items.map(({ index, lessonId, status: itemStatus, error }) => ({
      index,
      lessonId,
      status: itemStatus,
      ...(error ? { error } : {}),
    })),
  };
}

/** Each request advances at most one item; the original count authorizes all items. */
export async function createLessonBatch(
  uid: string,
  source: LessonSourceInput,
  count: number,
  requestId: string,
  retryId?: string,
): Promise<LessonBatch> {
  lessonRequestIdSchema.parse(requestId);
  if (retryId) lessonRequestIdSchema.parse(retryId);
  if (!Number.isInteger(count) || count < 1 || count > 5)
    throw new LessonActionError("invalid-content");
  const db = adminDb();
  const parsedSource = lessonSourceSchema.parse(source);
  const batchFingerprint = fingerprint({ source: parsedSource, count });
  const ref = db.doc(`lessonGenerationBatches/${uid}_${requestId}`);
  await recoverStaleLessonGenerations(uid);
  const initial = await ref.get();
  if (initial.exists) await getLessonBatch(uid, requestId);
  const now = new Date();
  const selected = await db.runTransaction(async (transaction) => {
    const [batch, user, subscription, usage] = await transaction.getAll(
      ref,
      db.doc(`users/${uid}`),
      db.doc(`subscriptions/${uid}`),
      db.doc(`usage/${uid}_${monthKey(now)}`),
    );
    if (user.data()?.status !== "active")
      throw new LessonActionError("inactive");
    const value = batch.data();
    if (
      value &&
      (value.ownerId !== uid || value.fingerprint !== batchFingerprint)
    )
      throw new LessonActionError("conflict");
    if (!value) {
      const access = generationAccessError(
        user.data(),
        subscription.data(),
        usage.data(),
        now,
      );
      if (access) throw new LessonActionError(access);
      const plan = resolveEffectivePlan(
        subscriptionRecord(subscription.data()),
        now,
      );
      if (
        number(usage.data()?.aiLessons) + count >
        PLAN_ENTITLEMENTS[plan].aiLessonsPerMonth
      )
        throw new LessonActionError("limit-reached");
    }
    let items: BatchItemRecord[] = value
      ? (value.items as BatchItemRecord[])
      : Array.from({ length: count }, (_, index) => ({
          index,
          requestId: randomUUID(),
          attempt: 1,
          status: "not-started",
          lessonId: null,
        }));
    const retryActions = Array.isArray(value?.retryActions)
      ? ([...value.retryActions] as string[])
      : [];
    if (items.some((item) => item.status === "pending")) return null;
    if (retryId && !retryActions.includes(retryId)) {
      if (retryActions.length >= 1_000) throw new LessonActionError("conflict");
      retryActions.push(retryId);
      items = items.map((item) =>
        item.status === "failed"
          ? {
              index: item.index,
              requestId: randomUUID(),
              attempt: item.attempt + 1,
              status: "not-started",
              lessonId: null,
            }
          : item,
      );
    }
    const index = items.findIndex((item) => item.status === "not-started");
    if (index < 0) {
      if (value && retryActions.length !== (value.retryActions?.length ?? 0))
        transaction.update(ref, {
          retryActions,
          updatedAt: FieldValue.serverTimestamp(),
        });
      return null;
    }
    const item = {
      ...items[index],
      status: "pending" as const,
      expiresAt: Timestamp.fromMillis(now.getTime() + GENERATION_LEASE_MS),
    };
    items = items.map((entry, position) => (position === index ? item : entry));
    transaction.set(
      ref,
      {
        ownerId: uid,
        requestId,
        fingerprint: batchFingerprint,
        source: parsedSource,
        items,
        retryActions,
        ...(value ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return item;
  });
  if (selected) {
    let outcome:
      | { status: "complete"; lessonId: string }
      | { status: "failed"; error: string };
    try {
      const lesson = await runGeneration(uid, {
        source: parsedSource,
        requestId: selected.requestId,
        ignoreCooldown: selected.index > 0 || selected.attempt > 1,
        batchClaim: { batchId: ref.id, index: selected.index },
      });
      outcome = { status: "complete", lessonId: lesson.id };
    } catch (error) {
      // A lost response after completion is repaired by the authoritative job.
      const job = await db
        .doc(`lessonGenerationRequests/${uid}_${selected.requestId}`)
        .get();
      if (job.data()?.status === "complete")
        outcome = {
          status: "complete",
          lessonId: String(job.data()!.lessonId),
        };
      else if (job.data()?.status === "pending")
        return getLessonBatch(uid, requestId);
      else
        outcome = {
          status: "failed",
          error:
            error instanceof LessonActionError || error instanceof AiSpendError
              ? error.code
              : "generation-failed",
        };
    }
    await db.runTransaction(async (transaction) => {
      const [batch, user] = await transaction.getAll(
        ref,
        db.doc(`users/${uid}`),
      );
      if (!batch.exists || batch.data()?.ownerId !== uid || !user.exists)
        return;
      const items = batch.data()!.items as BatchItemRecord[];
      if (
        items[selected.index]?.requestId !== selected.requestId ||
        items[selected.index]?.status !== "pending"
      )
        return;
      transaction.update(ref, {
        items: items.map((item, index) =>
          index === selected.index ? { ...item, ...outcome } : item,
        ),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
  return getLessonBatch(uid, requestId);
}

/** Compatibility helper for internal callers; HTTP clients use the durable manifest. */
export async function createLessons(
  uid: string,
  source: LessonSourceInput,
  count: number,
): Promise<LessonDetail[]> {
  const requestId = randomUUID();
  let batch = await createLessonBatch(uid, source, count, requestId);
  while (batch.hasMore && batch.status !== "pending")
    batch = await createLessonBatch(uid, source, count, requestId);
  return batch.lessons;
}

export async function updateLesson(
  uid: string,
  lessonId: string,
  content: LessonPlanInput,
  visibility?: "draft" | "published",
  expectedVersion?: number,
  restored?: { source: LessonSourceInput; sampleMode: boolean },
): Promise<LessonDetail> {
  assertExpectedVersion(expectedVersion);
  content = lessonPlanSchema.parse(content);
  const scheduled =
    content.warmUp.durationMinutes +
    content.mainActivity.durationMinutes +
    content.closingActivity.durationMinutes;
  if (scheduled !== content.durationMinutes)
    throw new LessonActionError(
      "invalid-content",
      `Activity durations total ${scheduled}; they must total ${content.durationMinutes} minutes.`,
    );
  const db = adminDb();
  const lessonRef = db.doc(`lessons/${lessonId}`);
  const resourceRef = db.doc(`resources/lesson_${lessonId}`);
  await db.runTransaction(async (transaction) => {
    const [user, lesson, resource, activity] = await transaction.getAll(
      db.doc(`users/${uid}`),
      lessonRef,
      resourceRef,
      publicActivityRef({ kind: "lesson-published", entityId: lessonId }),
    );
    if (user.data()?.status !== "active")
      throw new LessonActionError("inactive");
    if (!lesson.exists) throw new LessonActionError("not-found");
    if (lesson.data()?.ownerId !== uid)
      throw new LessonActionError("not-owner");
    if (lesson.data()?.generationStatus === "generating")
      throw new LessonActionError("busy");
    if (lesson.data()?.currentVersion !== expectedVersion)
      throw new LessonActionError("conflict");
    const source = lessonSourceSchema.parse({
      ...(restored?.source ?? lesson.data()?.source),
      subject: content.subject,
      gradeLevel: content.gradeLevel,
      durationMinutes: content.durationMinutes,
    });
    const sampleMode =
      restored?.sampleMode ?? lesson.data()?.sampleMode === true;
    const version = number(lesson.data()?.currentVersion) + 1;
    const nextVisibility =
      visibility ??
      (lessonVisibilitySchema.safeParse(lesson.data()?.visibility).success
        ? lesson.data()?.visibility
        : "draft");
    const moderation = retainModeration(resource.data(), "approved");
    transaction.update(lessonRef, {
      content,
      source,
      sampleMode,
      visibility: nextVisibility,
      ...(nextVisibility === "published"
        ? { publishedAt: FieldValue.serverTimestamp() }
        : {}),
      currentVersion: version,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(lessonRef.collection("versions").doc(`v${version}`), {
      ownerId: uid,
      version,
      kind: restored ? "restored" : "edited",
      source,
      content,
      sampleMode,
      createdAt: FieldValue.serverTimestamp(),
    });
    const resourceWasActive =
      resource.exists && resource.data()?.status === "active";
    if (nextVisibility === "published") {
      transaction.set(
        resourceRef,
        {
          ...lessonResourceData(uid, lessonId, content),
          moderationStatus: moderation,
          ...(resource.exists
            ? {}
            : {
                downloadCount: 0,
                ratingTotal: 0,
                ratingAverage: 0,
                ratingCount: 0,
              }),
          ...(resource.data()?.createdAt
            ? {}
            : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true },
      );
      if (!resourceWasActive)
        transaction.update(user.ref, {
          resourceCount: FieldValue.increment(1),
        });
      if (moderation === "approved")
        writePublicActivity(
          transaction,
          {
            authorId: uid,
            kind: "lesson-published",
            entityId: lessonId,
            label: "Published a lesson plan",
            title: content.title,
            href: `/lessons/${lessonId}`,
            tags: ["lesson-plan", content.subject],
          },
          activity,
        );
    } else if (resourceWasActive) {
      transaction.update(resourceRef, {
        status: "draft",
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(user.ref, {
        resourceCount: FieldValue.increment(-1),
      });
    }
  });
  return getLesson(uid, lessonId);
}

export interface LessonVersionDetail {
  version: number;
  kind: LessonVersion["kind"];
  createdAt: string;
  source: LessonSourceInput;
  content: LessonPlanInput;
  sampleMode: boolean;
}

export async function getLessonVersion(
  uid: string,
  lessonId: string,
  version: number,
): Promise<LessonVersionDetail> {
  lessonActionSchema.parse({ lessonId });
  if (!Number.isInteger(version) || version < 1)
    throw new LessonActionError("not-found");
  const db = adminDb();
  const [user, lesson, snapshot] = await db.getAll(
    db.doc(`users/${uid}`),
    db.doc(`lessons/${lessonId}`),
    db.doc(`lessons/${lessonId}/versions/v${version}`),
  );
  if (user.data()?.status !== "active") throw new LessonActionError("inactive");
  if (!lesson.exists || !snapshot.exists)
    throw new LessonActionError("not-found");
  if (lesson.data()?.ownerId !== uid || snapshot.data()?.ownerId !== uid)
    throw new LessonActionError("not-owner");
  const data = snapshot.data()!;
  return {
    version,
    kind: ["edited", "duplicated", "restored"].includes(data.kind)
      ? data.kind
      : "generated",
    createdAt: iso(data.createdAt),
    source: lessonSourceSchema.parse(data.source),
    content: lessonPlanSchema.parse(data.content),
    sampleMode: data.sampleMode === true,
  };
}

export async function restoreLessonVersion(
  uid: string,
  lessonId: string,
  version: number,
  expectedVersion: number,
): Promise<LessonDetail> {
  assertExpectedVersion(expectedVersion);
  const previous = await getLessonVersion(uid, lessonId, version);
  return updateLesson(
    uid,
    lessonId,
    previous.content,
    undefined,
    expectedVersion,
    { source: previous.source, sampleMode: previous.sampleMode },
  );
}

export async function duplicateLesson(
  uid: string,
  lessonId: string,
): Promise<LessonDetail> {
  const db = adminDb();
  const sourceRef = db.doc(`lessons/${lessonId}`);
  const duplicateRef = db.collection("lessons").doc();
  await db.runTransaction(async (transaction) => {
    const [user, source] = await transaction.getAll(
      db.doc(`users/${uid}`),
      sourceRef,
    );
    if (user.data()?.status !== "active")
      throw new LessonActionError("inactive");
    if (!source.exists) throw new LessonActionError("not-found");
    if (source.data()?.ownerId !== uid)
      throw new LessonActionError("not-owner");
    const content = lessonPlanSchema.parse(source.data()?.content);
    const duplicatedContent = {
      ...content,
      title: `${content.title.slice(0, 153)} (Copy)`,
    };
    const duplicated = {
      ownerId: uid,
      source: lessonSourceSchema.parse(source.data()?.source),
      content: duplicatedContent,
      sampleMode: source.data()?.sampleMode === true,
      visibility: "draft",
      status: "ready",
      generationStatus: "idle",
      currentVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.create(duplicateRef, duplicated);
    transaction.create(duplicateRef.collection("versions").doc("v1"), {
      ...duplicated,
      version: 1,
      kind: "duplicated",
    });
  });
  return getLesson(uid, duplicateRef.id);
}

export async function deleteLesson(
  uid: string,
  lessonId: string,
): Promise<void> {
  const parsed = lessonActionSchema.safeParse({ lessonId });
  if (!parsed.success) throw new LessonActionError("not-found");
  const db = adminDb();
  const lessonRef = db.doc(`lessons/${lessonId}`);
  const resourceRef = db.doc(`resources/lesson_${lessonId}`);
  const abandonedSpendId = await db.runTransaction(async (transaction) => {
    const [user, lesson, resource] = await transaction.getAll(
      db.doc(`users/${uid}`),
      lessonRef,
      resourceRef,
    );
    if (user.data()?.status !== "active")
      throw new LessonActionError("inactive");
    if (!lesson.exists) return;
    if (lesson.data()?.ownerId !== uid)
      throw new LessonActionError("not-owner");
    const pendingId = lesson.data()?.generationRequestId;
    const jobRef =
      typeof pendingId === "string"
        ? db.doc(`lessonGenerationRequests/${pendingId}`)
        : null;
    const job = jobRef ? await transaction.get(jobRef) : null;
    const usageRef = job?.data()?.period
      ? db.doc(`usage/${uid}_${job.data()!.period}`)
      : null;
    const usage = usageRef ? await transaction.get(usageRef) : null;
    if (
      jobRef &&
      job?.data()?.ownerId === uid &&
      job.data()?.status === "pending"
    ) {
      if (usageRef && usage?.exists)
        transaction.update(
          usageRef,
          generationUsage(usage.data(), job.data()?.isNew === true, -1),
        );
      transaction.update(jobRef, {
        status: "failed",
        failure: "deleted",
        completedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.delete(lessonRef);
    if (resource.exists) {
      transaction.delete(resourceRef);
      if (resource.data()?.status === "active")
        transaction.update(user.ref, {
          resourceCount: FieldValue.increment(-1),
        });
    }
    transaction.delete(db.doc(`posts/activity_lesson-published_${lessonId}`));
    return job?.data()?.spendAttemptId;
  });
  await abandonBestEffort(abandonedSpendId);
  await db.recursiveDelete(lessonRef);
  await deleteTeachingExports(uid, "lesson", lessonId);
}

export async function authorizeLessonExport(
  uid: string,
  lessonId: string,
): Promise<LessonDetail> {
  const [user, lesson] = await Promise.all([
    adminDb().doc(`users/${uid}`).get(),
    getLesson(uid, lessonId),
  ]);
  if (user.data()?.status !== "active") throw new LessonActionError("inactive");
  return lesson;
}
