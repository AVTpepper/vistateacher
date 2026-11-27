import "server-only";

import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { lessonPlanSchema } from "@/schemas/lesson";

export type ModerationStatus = "approved" | "pending" | "rejected";

const safeId = (value: unknown): value is string =>
  typeof value === "string" && /^[\w-]{1,128}$/.test(value);

export function moderationStatus(
  data: DocumentData | undefined,
): ModerationStatus | null {
  return data?.moderationStatus === "approved" ||
    data?.moderationStatus === "pending" ||
    data?.moderationStatus === "rejected"
    ? data.moderationStatus
    : null;
}

/** Only a new record receives the initial decision; owner edits retain decisions. */
export function retainModeration(
  previous: DocumentData | undefined,
  initial: ModerationStatus,
): ModerationStatus {
  return previous ? (moderationStatus(previous) ?? "pending") : initial;
}

export function isPublicResource(data: DocumentData | undefined): boolean {
  return data?.status === "active" && data.moderationStatus === "approved";
}

async function snapshots(
  refs: DocumentReference[],
  transaction?: Transaction,
): Promise<DocumentSnapshot[]> {
  if (!refs.length) return [];
  return transaction ? transaction.getAll(...refs) : adminDb().getAll(...refs);
}

/** Call during the transaction's read phase when a transaction is supplied. */
export async function publicResourceIds(
  resources: DocumentSnapshot[],
  transaction?: Transaction,
): Promise<Set<string>> {
  const eligible = resources.filter(
    (doc) => doc.exists && isPublicResource(doc.data()),
  );
  // Canonical interactive IDs must also carry their matching source link.
  const linked = eligible.filter(
    (doc) => doc.id.startsWith("lesson_") || doc.data()?.sourceLessonId != null,
  );
  const lessonIds = [
    ...new Set(linked.map((doc) => doc.data()!.sourceLessonId)),
  ].filter(safeId);
  const ownerIds = [
    ...new Set(linked.map((doc) => doc.data()!.authorId)),
  ].filter(safeId);
  const db = adminDb();
  const [lessons, owners] = await Promise.all([
    snapshots(
      lessonIds.map((id) => db.doc(`lessons/${id}`)),
      transaction,
    ),
    snapshots(
      ownerIds.map((id) => db.doc(`users/${id}`)),
      transaction,
    ),
  ]);
  const lessonMap = new Map(lessons.map((doc) => [doc.id, doc.data()]));
  const ownerMap = new Map(owners.map((doc) => [doc.id, doc.data()]));
  return new Set(
    eligible
      .filter((doc) => {
        const data = doc.data()!;
        if (!doc.id.startsWith("lesson_") && data.sourceLessonId == null)
          return true;
        if (
          !safeId(data.sourceLessonId) ||
          doc.id !== `lesson_${data.sourceLessonId}`
        )
          return false;
        const lesson = lessonMap.get(data.sourceLessonId);
        return (
          lesson?.visibility === "published" &&
          lesson.ownerId === data.authorId &&
          ownerMap.get(data.authorId)?.status === "active" &&
          lessonPlanSchema.safeParse(lesson.content).success
        );
      })
      .map((doc) => doc.id),
  );
}

export function activityTarget(data: DocumentData | undefined): {
  type: "resource" | "forumThread";
  id: string;
  path: string;
} | null {
  if (data?.type !== "activity" || !safeId(data.activityEntityId)) return null;
  if (data.activityKind === "lesson-published") {
    const id = `lesson_${data.activityEntityId}`;
    return { type: "resource", id, path: `resources/${id}` };
  }
  if (data.activityKind === "resource-published") {
    const id = data.activityEntityId;
    return { type: "resource", id, path: `resources/${id}` };
  }
  if (data.activityKind === "forum-thread") {
    const id = data.activityEntityId;
    return { type: "forumThread", id, path: `forumThreads/${id}` };
  }
  return null;
}

/** Derived announcements never have an owner bypass for a hidden source. */
export async function publicActivityIds(
  posts: DocumentSnapshot[],
  transaction?: Transaction,
): Promise<Set<string>> {
  const candidates = posts.filter(
    (post) =>
      post.exists &&
      post.data()?.type === "activity" &&
      post.data()?.moderationStatus === "approved",
  );
  const paths = [
    ...new Set(
      candidates
        .map((post) => activityTarget(post.data())?.path)
        .filter((path): path is string => Boolean(path)),
    ),
  ];
  const sources = await snapshots(
    paths.map((path) => adminDb().doc(path)),
    transaction,
  );
  const sourceMap = new Map(sources.map((doc) => [doc.ref.path, doc]));
  const visibleResources = await publicResourceIds(
    sources.filter((doc) => doc.ref.path.startsWith("resources/")),
    transaction,
  );
  return new Set(
    candidates
      .filter((post) => {
        const target = activityTarget(post.data());
        const source = target && sourceMap.get(target.path);
        const authorId = post.data()?.authorId;
        if (
          !target ||
          !source?.exists ||
          typeof authorId !== "string" ||
          !authorId ||
          source.data()?.authorId !== authorId
        )
          return false;
        return target.type === "resource"
          ? visibleResources.has(target.id)
          : source.data()?.moderationStatus === "approved";
      })
      .map((post) => post.id),
  );
}
