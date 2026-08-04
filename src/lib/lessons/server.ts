import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  PLAN_ENTITLEMENTS,
  resolveEffectivePlan,
} from "@/lib/entitlements/plan-entitlements";
import { adminDb } from "@/lib/firebase/admin";
import { generateLessonPlan } from "@/lib/lessons/provider";
import {
  lessonPlanSchema,
  lessonSourceSchema,
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

export interface LessonWorkspace {
  plan: "free" | "plus";
  usage: { used: number; limit: number; remaining: number };
  lessons: LessonSummary[];
}

export class LessonActionError extends Error {
  constructor(
    public readonly code:
      | "inactive"
      | "plus-required"
      | "limit-reached"
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
    generationStatus:
      data.generationStatus === "generating" ? "generating" : "idle",
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
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
  const limit = PLAN_ENTITLEMENTS.plus.aiLessonsPerMonth;
  return {
    plan,
    usage: { used, limit, remaining: Math.max(0, limit - used) },
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

async function reserveGeneration(
  uid: string,
  source: LessonSourceInput,
  lessonId?: string,
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
    if (plan !== "plus") throw new LessonActionError("plus-required");
    const used = number(usage.data()?.aiLessons);
    if (used >= PLAN_ENTITLEMENTS.plus.aiLessonsPerMonth)
      throw new LessonActionError("limit-reached");
    const lastGeneration = date(usage.data()?.lastAiLessonAt);
    if (
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
  const version = reservation.previousVersion + 1;
  await db.runTransaction(async (transaction) => {
    const lesson = await transaction.get(lessonRef);
    if (!lesson.exists || lesson.data()?.ownerId !== uid)
      throw new LessonActionError("not-owner");
    if (lesson.data()?.generationStatus !== "generating")
      throw new LessonActionError("busy");
    transaction.update(lessonRef, {
      source,
      content,
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
  });
}

async function runGeneration(
  uid: string,
  source: LessonSourceInput,
  lessonId?: string,
): Promise<LessonDetail> {
  const reservation = await reserveGeneration(uid, source, lessonId);
  try {
    const content = await generateLessonPlan(source);
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

export async function regenerateLesson(
  uid: string,
  lessonId: string,
  source?: LessonSourceInput,
): Promise<LessonDetail> {
  const current = await getLesson(uid, lessonId);
  return runGeneration(uid, source ?? current.source, lessonId);
}

export async function updateLesson(
  uid: string,
  lessonId: string,
  content: LessonPlanInput,
): Promise<LessonDetail> {
  const db = adminDb();
  const lessonRef = db.doc(`lessons/${lessonId}`);
  await db.runTransaction(async (transaction) => {
    const [user, lesson] = await transaction.getAll(
      db.doc(`users/${uid}`),
      lessonRef,
    );
    if (user.data()?.status !== "active")
      throw new LessonActionError("inactive");
    if (!lesson.exists) throw new LessonActionError("not-found");
    if (lesson.data()?.ownerId !== uid)
      throw new LessonActionError("not-owner");
    if (lesson.data()?.generationStatus === "generating")
      throw new LessonActionError("busy");
    const version = number(lesson.data()?.currentVersion) + 1;
    transaction.update(lessonRef, {
      content,
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

export async function getExportableLesson(
  uid: string,
  lessonId: string,
): Promise<LessonDetail> {
  const db = adminDb();
  const [user, plan, lesson] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    currentPlan(uid),
    getLesson(uid, lessonId),
  ]);
  if (user.data()?.status !== "active") throw new LessonActionError("inactive");
  if (plan !== "plus") throw new LessonActionError("plus-required");
  return lesson;
}
