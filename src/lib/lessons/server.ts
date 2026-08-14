import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  PLAN_ENTITLEMENTS,
  resolveEffectivePlan,
} from "@/lib/entitlements/plan-entitlements";
import { adminDb } from "@/lib/firebase/admin";
import {
  generateLessonPlan,
  type LessonGenerationOptions,
} from "@/lib/lessons/provider";
import {
  lessonActionSchema,
  lessonPlanSchema,
  lessonSourceSchema,
  lessonVisibilitySchema,
  type LessonPlanInput,
  type LessonSourceInput,
} from "@/schemas/lesson";
import type { SubscriptionRecord, SubscriptionStatus } from "@/types/models";

const LESSON_LIMIT = 100;
const VERSION_LIMIT = 30;
const GENERATION_COOLDOWN_MS = 8_000;

export interface LessonSummary {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  durationMinutes: number;
  currentVersion: number;
  visibility: "draft" | "published";
  generationStatus: "idle" | "generating";
  createdAt: string;
  updatedAt: string;
}

export interface LessonVersion {
  id: string;
  version: number;
  kind: "generated" | "edited" | "duplicated";
  createdAt: string;
}

export interface LessonDetail extends LessonSummary {
  source: LessonSourceInput;
  content: LessonPlanInput;
  versions: LessonVersion[];
}

export interface SharedLesson extends LessonDetail {
  author: { uid: string; displayName: string; photoURL: string | null };
  ownedByViewer: boolean;
}

export interface LessonQuotaUsage {
  used: number;
  limit: number | null;
  remaining: number | null;
}

export interface LessonWorkspace {
  plan: "free" | "plus";
  usage: {
    used: number;
    limit: number;
    remaining: number;
    creations: LessonQuotaUsage;
    refinements: LessonQuotaUsage;
    exports: LessonQuotaUsage;
  };
  lessons: LessonSummary[];
}

export class LessonActionError extends Error {
  constructor(
    public readonly code:
      | "inactive"
      | "plus-required"
      | "limit-reached"
      | "creation-limit-reached"
      | "refinement-limit-reached"
      | "export-limit-reached"
      | "rate-limited"
      | "not-found"
      | "not-owner"
      | "busy"
      | "generation-failed",
  ) {
    super(code);
  }
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function quota(used: number, limit: number | null): LessonQuotaUsage {
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
  };
}

function date(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function iso(value: unknown): string {
  return (date(value) ?? new Date(0)).toISOString();
}

function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function subscriptionRecord(
  data: FirebaseFirestore.DocumentData | undefined,
): SubscriptionRecord | null {
  if (!data) return null;
  return {
    plan: data.plan === "plus" ? "plus" : "free",
    status: String(data.status ?? "free") as SubscriptionStatus,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    billingInterval: null,
    currentPeriodEnd: date(data.currentPeriodEnd),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
    trialStartedAt: date(data.trialStartedAt),
    trialEndsAt: date(data.trialEndsAt),
    trialConsumed: data.trialConsumed === true,
    updatedAt: date(data.updatedAt) ?? new Date(0),
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
    moderationStatus: "approved",
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function currentPlan(uid: string) {
  const snapshot = await adminDb().doc(`subscriptions/${uid}`).get();
  return resolveEffectivePlan(subscriptionRecord(snapshot.data()));
}

export async function getLessonWorkspace(
  uid: string,
): Promise<LessonWorkspace> {
  const db = adminDb();
  const period = monthKey();
  const [plan, usage, lessons] = await Promise.all([
    currentPlan(uid),
    db.doc(`usage/${uid}_${period}`).get(),
    db
      .collection("lessons")
      .where("ownerId", "==", uid)
      .limit(LESSON_LIMIT)
      .get(),
  ]);
  const used = number(usage.data()?.aiLessons);
  const entitlements = PLAN_ENTITLEMENTS[plan];
  return {
    plan,
    usage: {
      used,
      limit: entitlements.aiLessonsPerMonth,
      remaining: Math.max(0, entitlements.aiLessonsPerMonth - used),
      creations: quota(
        number(usage.data()?.aiLessonCreations),
        entitlements.aiLessonCreationsPerMonth,
      ),
      refinements: quota(
        number(usage.data()?.aiRefinements),
        entitlements.aiRefinementsPerMonth,
      ),
      exports: quota(
        number(usage.data()?.lessonExports),
        entitlements.lessonExportsPerMonth,
      ),
    },
    lessons: lessons.docs
      .filter((document) => document.data().content)
      .map((document) => summary(document.id, document.data()))
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
  };
}

export async function getLesson(
  uid: string,
  lessonId: string,
): Promise<LessonDetail> {
  const db = adminDb();
  const lessonRef = db.doc(`lessons/${lessonId}`);
  const [lesson, versions] = await Promise.all([
    lessonRef.get(),
    lessonRef
      .collection("versions")
      .orderBy("version", "desc")
      .limit(VERSION_LIMIT)
      .get(),
  ]);
  if (!lesson.exists) throw new LessonActionError("not-found");
  const data = lesson.data()!;
  if (data.ownerId !== uid) throw new LessonActionError("not-owner");
  return {
    ...summary(lesson.id, data),
    source: lessonSourceSchema.parse(data.source),
    content: lessonPlanSchema.parse(data.content),
    versions: versions.docs.map((document) => ({
      id: document.id,
      version: number(document.data().version),
      kind:
        document.data().kind === "edited" ||
        document.data().kind === "duplicated"
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
  if (!ownedByViewer && lesson.data()?.visibility !== "published") return null;
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
  const data = lesson.data()!;
  return {
    ...summary(lesson.id, data),
    source: lessonSourceSchema.parse(data.source),
    content: lessonPlanSchema.parse(data.content),
    versions:
      versions?.docs.map((document) => ({
        id: document.id,
        version: number(document.data().version),
        kind:
          document.data().kind === "edited" ||
          document.data().kind === "duplicated"
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
  };
}

async function reserveGeneration(
  uid: string,
  source: LessonSourceInput,
  lessonId?: string,
  options?: { ignoreCooldown?: boolean },
): Promise<{
  lessonId: string;
  previousVersion: number;
  isNew: boolean;
  period: string;
}> {
  const db = adminDb();
  const now = new Date();
  const period = monthKey(now);
  const usageRef = db.doc(`usage/${uid}_${period}`);
  const lessonRef = lessonId
    ? db.doc(`lessons/${lessonId}`)
    : db.collection("lessons").doc();
  let previousVersion = 0;

  await db.runTransaction(async (transaction) => {
    const refs = [
      db.doc(`users/${uid}`),
      db.doc(`subscriptions/${uid}`),
      usageRef,
      ...(lessonId ? [lessonRef] : []),
    ];
    const snapshots = await transaction.getAll(...refs);
    const [user, subscription, usage, existingLesson] = snapshots;
    if (user.data()?.status !== "active")
      throw new LessonActionError("inactive");
    const plan = resolveEffectivePlan(
      subscriptionRecord(subscription.data()),
      now,
    );
    const entitlements = PLAN_ENTITLEMENTS[plan];
    const used = number(usage.data()?.aiLessons);
    const creations = number(usage.data()?.aiLessonCreations);
    const refinements = number(usage.data()?.aiRefinements);
    if (!lessonId && creations >= entitlements.aiLessonCreationsPerMonth)
      throw new LessonActionError("creation-limit-reached");
    if (lessonId && refinements >= entitlements.aiRefinementsPerMonth)
      throw new LessonActionError("refinement-limit-reached");
    if (used >= entitlements.aiLessonsPerMonth)
      throw new LessonActionError("limit-reached");
    const lastGeneration = date(usage.data()?.lastAiLessonAt);
    if (
      !options?.ignoreCooldown &&
      lastGeneration &&
      now.getTime() - lastGeneration.getTime() < GENERATION_COOLDOWN_MS
    )
      throw new LessonActionError("rate-limited");

    if (lessonId) {
      if (!existingLesson?.exists) throw new LessonActionError("not-found");
      const lessonData = existingLesson.data()!;
      if (lessonData.ownerId !== uid) throw new LessonActionError("not-owner");
      if (lessonData.generationStatus === "generating")
        throw new LessonActionError("busy");
      previousVersion = number(lessonData.currentVersion);
      transaction.update(lessonRef, {
        generationStatus: "generating",
        pendingSource: source,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      transaction.create(lessonRef, {
        ownerId: uid,
        source,
        content: null,
        visibility: "draft",
        status: "generating",
        generationStatus: "generating",
        currentVersion: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.set(
      usageRef,
      {
        uid,
        period,
        aiLessons: used + 1,
        aiLessonCreations: creations + (lessonId ? 0 : 1),
        aiRefinements: refinements + (lessonId ? 1 : 0),
        lastAiLessonAt: Timestamp.fromDate(now),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return { lessonId: lessonRef.id, previousVersion, isNew: !lessonId, period };
}

async function releaseGeneration(
  uid: string,
  reservation: { lessonId: string; isNew: boolean; period: string },
) {
  const db = adminDb();
  const usageRef = db.doc(`usage/${uid}_${reservation.period}`);
  const lessonRef = db.doc(`lessons/${reservation.lessonId}`);
  await db.runTransaction(async (transaction) => {
    const [usage, lesson] = await transaction.getAll(usageRef, lessonRef);
    transaction.set(
      usageRef,
      {
        aiLessons: Math.max(0, number(usage.data()?.aiLessons) - 1),
        aiLessonCreations: Math.max(
          0,
          number(usage.data()?.aiLessonCreations) - (reservation.isNew ? 1 : 0),
        ),
        aiRefinements: Math.max(
          0,
          number(usage.data()?.aiRefinements) - (reservation.isNew ? 0 : 1),
        ),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    if (!lesson.exists || lesson.data()?.ownerId !== uid) return;
    if (reservation.isNew) transaction.delete(lessonRef);
    else
      transaction.update(lessonRef, {
        generationStatus: "idle",
        pendingSource: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
  });
}

async function completeGeneration(
  uid: string,
  source: LessonSourceInput,
  content: LessonPlanInput,
  reservation: { lessonId: string; previousVersion: number },
) {
  const db = adminDb();
  const lessonRef = db.doc(`lessons/${reservation.lessonId}`);
  const resourceRef = db.doc(`resources/lesson_${reservation.lessonId}`);
  const version = reservation.previousVersion + 1;
  await db.runTransaction(async (transaction) => {
    const [lesson, resource, user] = await transaction.getAll(
      lessonRef,
      resourceRef,
      db.doc(`users/${uid}`),
    );
    if (!lesson.exists || lesson.data()?.ownerId !== uid)
      throw new LessonActionError("not-owner");
    if (lesson.data()?.generationStatus !== "generating")
      throw new LessonActionError("busy");
    transaction.update(lessonRef, {
      source,
      content,
      visibility: lessonVisibilitySchema.safeParse(lesson.data()?.visibility)
        .success
        ? lesson.data()?.visibility
        : "draft",
      status: "ready",
      generationStatus: "idle",
      pendingSource: FieldValue.delete(),
      currentVersion: version,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(lessonRef.collection("versions").doc(`v${version}`), {
      ownerId: uid,
      version,
      kind: "generated",
      source,
      content,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (lesson.data()?.visibility === "published") {
      transaction.set(
        resourceRef,
        {
          ...lessonResourceData(uid, reservation.lessonId, content),
          ...(resource.exists
            ? {}
            : {
                downloadCount: 0,
                ratingTotal: 0,
                ratingAverage: 0,
                ratingCount: 0,
                createdAt: FieldValue.serverTimestamp(),
              }),
        },
        { merge: true },
      );
      if (!resource.exists || resource.data()?.status !== "active")
        transaction.update(user.ref, {
          resourceCount: FieldValue.increment(1),
        });
    }
  });
}

async function runGeneration(
  uid: string,
  source: LessonSourceInput,
  lessonId?: string,
  options?: { ignoreCooldown?: boolean; generation?: LessonGenerationOptions },
): Promise<LessonDetail> {
  const reservation = await reserveGeneration(uid, source, lessonId, {
    ignoreCooldown: options?.ignoreCooldown,
  });
  try {
    const content = await generateLessonPlan(source, options?.generation);
    await completeGeneration(uid, source, content, reservation);
    return getLesson(uid, reservation.lessonId);
  } catch (error) {
    await releaseGeneration(uid, reservation);
    if (error instanceof LessonActionError) throw error;
    throw new LessonActionError("generation-failed");
  }
}

export async function createLesson(
  uid: string,
  source: LessonSourceInput,
): Promise<LessonDetail> {
  return runGeneration(uid, source);
}

async function assertBatchCreationCapacity(uid: string, count: number) {
  const now = new Date();
  const period = monthKey(now);
  const db = adminDb();
  const [user, subscription, usage] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`subscriptions/${uid}`).get(),
    db.doc(`usage/${uid}_${period}`).get(),
  ]);
  if (user.data()?.status !== "active") throw new LessonActionError("inactive");
  const plan = resolveEffectivePlan(
    subscriptionRecord(subscription.data()),
    now,
  );
  const entitlements = PLAN_ENTITLEMENTS[plan];
  const used = number(usage.data()?.aiLessons);
  const creations = number(usage.data()?.aiLessonCreations);
  if (used + count > entitlements.aiLessonsPerMonth)
    throw new LessonActionError("limit-reached");
  if (creations + count > entitlements.aiLessonCreationsPerMonth)
    throw new LessonActionError("creation-limit-reached");
}

export async function createLessons(
  uid: string,
  source: LessonSourceInput,
  count: number,
): Promise<LessonDetail[]> {
  await assertBatchCreationCapacity(uid, count);
  const generated: LessonDetail[] = [];
  for (let index = 0; index < count; index += 1) {
    generated.push(
      await runGeneration(uid, source, undefined, {
        ignoreCooldown: index > 0,
      }),
    );
  }
  return generated;
}

export async function regenerateLesson(
  uid: string,
  lessonId: string,
  source?: LessonSourceInput,
  feedback?: string,
  referenceContent?: LessonPlanInput,
): Promise<LessonDetail> {
  const current = await getLesson(uid, lessonId);
  return runGeneration(uid, source ?? current.source, lessonId, {
    generation: {
      feedback,
      referencePlan: referenceContent ?? current.content,
    },
  });
}

export async function updateLesson(
  uid: string,
  lessonId: string,
  content: LessonPlanInput,
  visibility?: "draft" | "published",
): Promise<LessonDetail> {
  const db = adminDb();
  const lessonRef = db.doc(`lessons/${lessonId}`);
  const resourceRef = db.doc(`resources/lesson_${lessonId}`);
  await db.runTransaction(async (transaction) => {
    const [user, lesson, resource] = await transaction.getAll(
      db.doc(`users/${uid}`),
      lessonRef,
      resourceRef,
    );
    if (user.data()?.status !== "active")
      throw new LessonActionError("inactive");
    if (!lesson.exists) throw new LessonActionError("not-found");
    if (lesson.data()?.ownerId !== uid)
      throw new LessonActionError("not-owner");
    if (lesson.data()?.generationStatus === "generating")
      throw new LessonActionError("busy");
    const version = number(lesson.data()?.currentVersion) + 1;
    const nextVisibility =
      visibility ??
      (lessonVisibilitySchema.safeParse(lesson.data()?.visibility).success
        ? lesson.data()?.visibility
        : "draft");
    transaction.update(lessonRef, {
      content,
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
      kind: "edited",
      source: lesson.data()?.source,
      content,
      createdAt: FieldValue.serverTimestamp(),
    });
    const resourceWasActive =
      resource.exists && resource.data()?.status === "active";
    if (nextVisibility === "published") {
      transaction.set(
        resourceRef,
        {
          ...lessonResourceData(uid, lessonId, content),
          ...(resource.exists
            ? {}
            : {
                downloadCount: 0,
                ratingTotal: 0,
                ratingAverage: 0,
                ratingCount: 0,
                createdAt: FieldValue.serverTimestamp(),
              }),
        },
        { merge: true },
      );
      if (!resourceWasActive)
        transaction.update(user.ref, {
          resourceCount: FieldValue.increment(1),
        });
    } else if (resourceWasActive) {
      transaction.update(resourceRef, {
        status: "draft",
        moderationStatus: "pending",
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(user.ref, {
        resourceCount: FieldValue.increment(-1),
      });
    }
  });
  return getLesson(uid, lessonId);
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
    const duplicatedContent = { ...content, title: `${content.title} (Copy)` };
    const duplicated = {
      ownerId: uid,
      source: lessonSourceSchema.parse(source.data()?.source),
      content: duplicatedContent,
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
  await db.runTransaction(async (transaction) => {
    const [user, lesson, resource] = await transaction.getAll(
      db.doc(`users/${uid}`),
      lessonRef,
      resourceRef,
    );
    if (user.data()?.status !== "active")
      throw new LessonActionError("inactive");
    if (!lesson.exists) throw new LessonActionError("not-found");
    if (lesson.data()?.ownerId !== uid)
      throw new LessonActionError("not-owner");
    transaction.delete(lessonRef);
    if (resource.exists) {
      transaction.delete(resourceRef);
      if (resource.data()?.status === "active")
        transaction.update(user.ref, {
          resourceCount: FieldValue.increment(-1),
        });
    }
  });
  await db.recursiveDelete(lessonRef);
}

export interface LessonExportReservation {
  lesson: LessonDetail;
  period: string;
  counted: boolean;
}

export async function reserveLessonExport(
  uid: string,
  lessonId: string,
  options: { countUsage?: boolean } = {},
): Promise<LessonExportReservation> {
  const db = adminDb();
  const now = new Date();
  const period = monthKey(now);
  const lesson = await getLesson(uid, lessonId);
  const shouldCount = options.countUsage !== false;
  const usageRef = db.doc(`usage/${uid}_${period}`);
  const lessonRef = db.doc(`lessons/${lessonId}`);
  let counted = false;

  await db.runTransaction(async (transaction) => {
    const [user, subscription, usage, currentLesson] = await transaction.getAll(
      db.doc(`users/${uid}`),
      db.doc(`subscriptions/${uid}`),
      usageRef,
      lessonRef,
    );
    if (user.data()?.status !== "active")
      throw new LessonActionError("inactive");
    if (!currentLesson.exists) throw new LessonActionError("not-found");
    if (currentLesson.data()?.ownerId !== uid)
      throw new LessonActionError("not-owner");
    const plan = resolveEffectivePlan(
      subscriptionRecord(subscription.data()),
      now,
    );
    if (!shouldCount) return;
    const limit = PLAN_ENTITLEMENTS[plan].lessonExportsPerMonth;
    const used = number(usage.data()?.lessonExports);
    if (limit !== null && used >= limit)
      throw new LessonActionError("export-limit-reached");
    if (limit !== null) {
      counted = true;
      transaction.set(
        usageRef,
        {
          uid,
          period,
          lessonExports: used + 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  });

  return { lesson, period, counted };
}

export async function releaseLessonExport(
  uid: string,
  reservation: Pick<LessonExportReservation, "period" | "counted">,
): Promise<void> {
  if (!reservation.counted) return;
  const usageRef = adminDb().doc(`usage/${uid}_${reservation.period}`);
  await adminDb().runTransaction(async (transaction) => {
    const usage = await transaction.get(usageRef);
    transaction.set(
      usageRef,
      {
        lessonExports: Math.max(0, number(usage.data()?.lessonExports) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}
