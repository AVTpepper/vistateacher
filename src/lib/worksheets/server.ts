import "server-only";
import { deleteTeachingExports } from "@/lib/teaching-exports/cleanup";

import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
  aiUsage,
  firestoreIso,
  generationAccessError,
  usageMonth,
  usageNumber,
} from "@/lib/ai/usage";
import { getLesson, LessonActionError } from "@/lib/lessons/server";
import { generateWorksheet } from "@/lib/worksheets/provider";
import { validateWorksheetContent } from "@/lib/worksheets/validation";
import {
  worksheetSourceSchema,
  type WorksheetContent,
  type WorksheetSourceInput,
} from "@/schemas/worksheet";
import type { LessonPlanInput } from "@/schemas/lesson";

export class WorksheetActionError extends Error {
  constructor(
    public readonly code:
      | "inactive"
      | "limit-reached"
      | "rate-limited"
      | "not-found"
      | "busy"
      | "conflict"
      | "generation-failed"
      | "invalid-content"
      | "invalid-cursor",
    message?: string,
  ) {
    super(message ?? code);
  }
}
export interface WorksheetSummary {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  questionCount: number;
  currentVersion: number;
  updatedAt: string;
  sampleMode: boolean;
  generationStatus: "idle" | "generating";
}
export interface WorksheetDetail extends WorksheetSummary {
  source: WorksheetSourceInput;
  content: WorksheetContent;
  versions: {
    version: number;
    kind: "generated" | "edited" | "restored";
    createdAt: string;
  }[];
  reference: { lessonId: string; title: string; version: number } | null;
}
export interface WorksheetWorkspace {
  usage: ReturnType<typeof aiUsage>;
  worksheets: WorksheetSummary[];
  nextCursor: string | null;
}
type Reference = {
  lessonId: string;
  title: string;
  version: number;
  content: LessonPlanInput;
};

function summary(
  id: string,
  data: FirebaseFirestore.DocumentData,
): WorksheetSummary {
  const content = validateWorksheetContent(data.content);
  return {
    id,
    title: content.title,
    subject: content.subject,
    gradeLevel: content.gradeLevel,
    questionCount: content.questions.length,
    currentVersion: usageNumber(data.currentVersion),
    updatedAt: firestoreIso(data.updatedAt),
    sampleMode: data.sampleMode === true,
    generationStatus:
      data.generationStatus === "generating" ? "generating" : "idle",
  };
}
function owned(data: FirebaseFirestore.DocumentData | undefined, uid: string) {
  // A private worksheet should not reveal its existence to another account.
  if (!data || data.ownerId !== uid || !data.content)
    throw new WorksheetActionError("not-found");
}
export async function getWorksheetWorkspace(
  uid: string,
  cursor?: string,
): Promise<WorksheetWorkspace> {
  const db = adminDb();
  if ((await db.doc(`users/${uid}`).get()).data()?.status !== "active")
    throw new WorksheetActionError("inactive");
  await recoverStaleWorksheetGenerations(uid);
  let query = db
    .collection("worksheets")
    .where("ownerId", "==", uid)
    .orderBy("updatedAt", "desc");
  if (cursor) {
    const previous = await db.doc(`worksheets/${cursor}`).get();
    if (!previous.exists || previous.data()?.ownerId !== uid)
      throw new WorksheetActionError("invalid-cursor");
    query = query.startAfter(previous);
  }
  const [subscription, usage, documents] = await Promise.all([
    db.doc(`subscriptions/${uid}`).get(),
    db.doc(`usage/${uid}_${usageMonth()}`).get(),
    query.limit(21).get(),
  ]);
  return {
    usage: aiUsage(subscription.data(), usage.data()),
    worksheets: documents.docs
      .slice(0, 20)
      .filter((doc) => doc.data().content)
      .map((doc) => summary(doc.id, doc.data())),
    nextCursor: documents.size > 20 ? documents.docs[19].id : null,
  };
}
export async function getWorksheet(
  uid: string,
  id: string,
): Promise<WorksheetDetail> {
  const ref = adminDb().doc(`worksheets/${id}`);
  const [doc, user] = await Promise.all([
    ref.get(),
    adminDb().doc(`users/${uid}`).get(),
  ]);
  if (user.data()?.status !== "active")
    throw new WorksheetActionError("inactive");
  const data = doc.data();
  if (
    data?.ownerId === uid &&
    data.generationStatus === "generating" &&
    (await recoverStaleWorksheetGenerations(uid))
  )
    return getWorksheet(uid, id);
  owned(data, uid);
  const versions = await ref
    .collection("versions")
    .orderBy("version", "desc")
    .limit(30)
    .get();
  return {
    ...summary(doc.id, data!),
    source: worksheetSourceSchema.parse(data!.source),
    content: validateWorksheetContent(data!.content),
    versions: versions.docs.map((version) => ({
      version: usageNumber(version.data().version),
      kind:
        version.data().kind === "restored"
          ? "restored"
          : version.data().kind === "edited"
            ? "edited"
            : "generated",
      createdAt: firestoreIso(version.data().createdAt),
    })),
    reference: data!.reference
      ? {
          lessonId: data!.reference.lessonId,
          title: data!.reference.title,
          version: data!.reference.version,
        }
      : null,
  };
}

async function authorizedReference(
  uid: string,
  source: WorksheetSourceInput,
): Promise<Reference | null> {
  if (!source.sourceLessonId) return null;
  try {
    const lesson = await getLesson(uid, source.sourceLessonId);
    return {
      lessonId: lesson.id,
      title: lesson.title,
      version: lesson.currentVersion,
      content: lesson.content,
    };
  } catch (error) {
    if (error instanceof LessonActionError)
      throw new WorksheetActionError("not-found");
    throw error;
  }
}

/** Reconcile abandoned jobs on the next authenticated workspace visit or retry. */
export async function recoverStaleWorksheetGenerations(
  uid: string,
  now = new Date(),
): Promise<number> {
  const db = adminDb();
  const expired = await db
    .collection("worksheetGenerationRequests")
    .where("ownerId", "==", uid)
    .where("status", "==", "pending")
    .where("expiresAt", "<=", Timestamp.fromDate(now))
    .limit(50)
    .get();
  let recovered = 0;
  for (const candidate of expired.docs) {
    const data = candidate.data();
    const usageRef = db.doc(`usage/${uid}_${data.period}`);
    const worksheetRef = db.doc(`worksheets/${data.worksheetId}`);
    const didRecover = await db.runTransaction(async (transaction) => {
      const [job, usage, worksheet] = await transaction.getAll(
        candidate.ref,
        usageRef,
        worksheetRef,
      );
      const current = job.data();
      if (
        current?.ownerId !== uid ||
        current.status !== "pending" ||
        !(current.expiresAt instanceof Timestamp) ||
        current.expiresAt.toMillis() > now.getTime()
      )
        return false;
      transaction.set(
        usageRef,
        {
          aiLessons: Math.max(0, usageNumber(usage.data()?.aiLessons) - 1),
          aiWorksheetCreations: Math.max(
            0,
            usageNumber(usage.data()?.aiWorksheetCreations) -
              (current.isNew ? 1 : 0),
          ),
          aiRefinements: Math.max(
            0,
            usageNumber(usage.data()?.aiRefinements) - (current.isNew ? 0 : 1),
          ),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      transaction.update(candidate.ref, {
        status: "failed",
        failure: "expired",
        completedAt: FieldValue.serverTimestamp(),
      });
      if (
        worksheet.data()?.ownerId === uid &&
        worksheet.data()?.generationRequestId === candidate.id
      ) {
        if (!worksheet.data()?.content) transaction.delete(worksheetRef);
        else
          transaction.update(worksheetRef, {
            generationStatus: "idle",
            generationRequestId: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
      }
      return true;
    });
    if (didRecover) recovered++;
  }
  return recovered;
}

export async function createWorksheet(
  uid: string,
  source: WorksheetSourceInput,
  requestId: string,
) {
  return runGeneration(uid, source, requestId);
}
export async function regenerateWorksheet(
  uid: string,
  id: string,
  expectedVersion: number,
  requestId: string,
) {
  const worksheet = await getWorksheet(uid, id);
  return runGeneration(uid, worksheet.source, requestId, {
    id,
    expectedVersion,
  });
}

async function runGeneration(
  uid: string,
  source: WorksheetSourceInput,
  requestId: string,
  existing?: { id: string; expectedVersion: number },
): Promise<WorksheetDetail> {
  const db = adminDb();
  await recoverStaleWorksheetGenerations(uid);
  const now = new Date();
  const period = usageMonth(now);
  const usageRef = db.doc(`usage/${uid}_${period}`);
  const jobRef = db.doc(`worksheetGenerationRequests/${uid}_${requestId}`);
  const ref = existing
    ? db.doc(`worksheets/${existing.id}`)
    : db.collection("worksheets").doc();
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ source, existing: existing ?? null }))
    .digest("hex");
  const previousJob = await jobRef.get();
  if (
    previousJob.data()?.status === "complete" &&
    previousJob.data()?.fingerprint === fingerprint
  )
    return getWorksheet(uid, String(previousJob.data()!.worksheetId));
  // Reuse the saved reference snapshot on regeneration, even if the source lesson was later deleted.
  const reference = existing ? null : await authorizedReference(uid, source);
  const reservation = await db.runTransaction(async (transaction) => {
    const [user, subscription, usage, job, current] = await transaction.getAll(
      db.doc(`users/${uid}`),
      db.doc(`subscriptions/${uid}`),
      usageRef,
      jobRef,
      ref,
    );
    if (user.data()?.status !== "active")
      throw new WorksheetActionError("inactive");
    if (job.exists) {
      if (job.data()?.fingerprint !== fingerprint)
        throw new WorksheetActionError("conflict");
      if (job.data()?.status === "complete")
        return {
          replay: true,
          id: String(job.data()!.worksheetId),
          version: 0,
          reference: null,
        };
      throw new WorksheetActionError(
        job.data()?.status === "pending" ? "busy" : "generation-failed",
      );
    }
    if (existing) {
      owned(current.data(), uid);
      if (current.data()?.generationStatus === "generating")
        throw new WorksheetActionError("busy");
      if (current.data()?.currentVersion !== existing.expectedVersion)
        throw new WorksheetActionError("conflict");
    }
    const access = generationAccessError(
      user.data(),
      subscription.data(),
      usage.data(),
      now,
    );
    if (access) throw new WorksheetActionError(access);
    const version = existing ? usageNumber(current.data()?.currentVersion) : 0;
    const savedReference = (
      existing ? (current.data()?.reference ?? null) : reference
    ) as Reference | null;
    const lock = {
      generationStatus: "generating",
      generationRequestId: jobRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (existing) transaction.update(ref, lock);
    else
      transaction.create(ref, {
        ...lock,
        ownerId: uid,
        source,
        reference: savedReference,
        content: null,
        currentVersion: 0,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
    transaction.create(jobRef, {
      ownerId: uid,
      fingerprint,
      worksheetId: ref.id,
      status: "pending",
      period,
      isNew: !existing,
      expiresAt: Timestamp.fromDate(new Date(now.getTime() + 10 * 60_000)),
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(
      usageRef,
      {
        uid,
        period,
        aiLessons: usageNumber(usage.data()?.aiLessons) + 1,
        aiWorksheetCreations:
          usageNumber(usage.data()?.aiWorksheetCreations) + (existing ? 0 : 1),
        aiRefinements:
          usageNumber(usage.data()?.aiRefinements) + (existing ? 1 : 0),
        lastAiLessonAt: Timestamp.fromDate(now),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { replay: false, id: ref.id, version, reference: savedReference };
  });
  if (reservation.replay) return getWorksheet(uid, reservation.id);
  try {
    const content = await generateWorksheet(
      source,
      reservation.reference?.content,
    );
    await db.runTransaction(async (transaction) => {
      const [user, worksheet, job] = await transaction.getAll(
        db.doc(`users/${uid}`),
        ref,
        jobRef,
      );
      if (user.data()?.status !== "active")
        throw new WorksheetActionError("inactive");
      if (!worksheet.exists || worksheet.data()?.ownerId !== uid)
        throw new WorksheetActionError("not-found");
      if (
        worksheet.data()?.generationRequestId !== jobRef.id ||
        job.data()?.status !== "pending" ||
        worksheet.data()?.currentVersion !== reservation.version
      )
        throw new WorksheetActionError("conflict");
      const version = reservation.version + 1;
      const sampleMode = process.env.AI_PROVIDER === "MOCK";
      transaction.update(ref, {
        content,
        source,
        currentVersion: version,
        sampleMode,
        generationStatus: "idle",
        generationRequestId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(ref.collection("versions").doc(`v${version}`), {
        ownerId: uid,
        version,
        kind: "generated",
        content,
        source,
        sampleMode,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(jobRef, {
        status: "complete",
        completedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    await db.runTransaction(async (transaction) => {
      const [usage, worksheet, job] = await transaction.getAll(
        usageRef,
        ref,
        jobRef,
      );
      if (job.data()?.status !== "pending") return;
      transaction.set(
        usageRef,
        {
          aiLessons: Math.max(0, usageNumber(usage.data()?.aiLessons) - 1),
          aiWorksheetCreations: Math.max(
            0,
            usageNumber(usage.data()?.aiWorksheetCreations) -
              (existing ? 0 : 1),
          ),
          aiRefinements: Math.max(
            0,
            usageNumber(usage.data()?.aiRefinements) - (existing ? 1 : 0),
          ),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      transaction.update(jobRef, {
        status: "failed",
        completedAt: FieldValue.serverTimestamp(),
      });
      if (
        worksheet.data()?.ownerId === uid &&
        worksheet.data()?.generationRequestId === jobRef.id
      ) {
        if (!existing) transaction.delete(ref);
        else
          transaction.update(ref, {
            generationStatus: "idle",
            generationRequestId: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
      }
    });
    if (error instanceof WorksheetActionError) throw error;
    throw new WorksheetActionError("generation-failed");
  }
  // A response read failure after commit must never refund a successful generation.
  return getWorksheet(uid, ref.id);
}

export async function updateWorksheet(
  uid: string,
  id: string,
  value: unknown,
  expectedVersion: number,
  kind: "edited" | "restored" = "edited",
  restoredSampleMode?: boolean,
) {
  let content: WorksheetContent;
  try {
    content = validateWorksheetContent(value);
  } catch (error) {
    throw new WorksheetActionError(
      "invalid-content",
      error instanceof Error
        ? error.message.slice(0, 300)
        : "Review the worksheet content.",
    );
  }
  const db = adminDb();
  const ref = db.doc(`worksheets/${id}`);
  await db.runTransaction(async (transaction) => {
    const [user, worksheet] = await transaction.getAll(
      db.doc(`users/${uid}`),
      ref,
    );
    if (user.data()?.status !== "active")
      throw new WorksheetActionError("inactive");
    owned(worksheet.data(), uid);
    if (worksheet.data()?.generationStatus === "generating")
      throw new WorksheetActionError("busy");
    if (worksheet.data()?.currentVersion !== expectedVersion)
      throw new WorksheetActionError("conflict");
    const version = expectedVersion + 1;
    const sampleMode =
      restoredSampleMode ?? worksheet.data()?.sampleMode === true;
    transaction.update(ref, {
      content,
      sampleMode,
      currentVersion: version,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(ref.collection("versions").doc(`v${version}`), {
      ownerId: uid,
      version,
      kind,
      sampleMode,
      content,
      source: worksheet.data()!.source,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return getWorksheet(uid, id);
}
export async function restoreWorksheetVersion(
  uid: string,
  id: string,
  version: number,
  expectedVersion: number,
) {
  const current = await getWorksheet(uid, id);
  const previous = await adminDb()
    .doc(`worksheets/${id}/versions/v${version}`)
    .get();
  if (!previous.exists) throw new WorksheetActionError("not-found");
  return updateWorksheet(
    uid,
    id,
    previous.data()!.content,
    expectedVersion,
    "restored",
    typeof previous.data()!.sampleMode === "boolean"
      ? previous.data()!.sampleMode
      : current.sampleMode,
  );
}
export async function deleteWorksheet(uid: string, id: string) {
  const db = adminDb();
  const ref = db.doc(`worksheets/${id}`);
  await db.runTransaction(async (transaction) => {
    const [user, worksheet] = await transaction.getAll(
      db.doc(`users/${uid}`),
      ref,
    );
    if (user.data()?.status !== "active")
      throw new WorksheetActionError("inactive");
    if (!worksheet.exists) return;
    owned(worksheet.data(), uid);
    if (worksheet.data()?.generationStatus === "generating")
      throw new WorksheetActionError("busy");
    transaction.delete(ref);
  });
  // Parent deletion prevents another mutation while history is removed.
  await db.recursiveDelete(ref.collection("versions"));
  await deleteTeachingExports(uid, "worksheet", id);
}
