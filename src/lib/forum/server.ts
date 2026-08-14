import "server-only";

import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Query,
} from "firebase-admin/firestore";

import { decodeForumCursor, encodeForumCursor } from "@/lib/forum/cursor";
import { DEFAULT_FORUM_CATEGORIES } from "@/lib/forum/categories";
import { adminDb } from "@/lib/firebase/admin";
import type {
  CreateForumReplyInput,
  CreateForumThreadInput,
  ForumModerationInput,
  ForumQuery,
  ForumReportInput,
  UpdateForumReplyInput,
  UpdateForumThreadInput,
} from "@/schemas/forum";
import type { UserRole } from "@/types/models";

const PAGE_SIZE = 10;
const REPLY_LIMIT = 100;

export interface ForumAuthor {
  uid: string;
  displayName: string;
  photoURL: string | null;
  gradeLevel: string;
  school: string;
}

export interface ForumCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  threadCount: number;
  postCount: number;
}

export interface ForumThreadSummary {
  id: string;
  author: ForumAuthor;
  category: { id: string; name: string };
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  locked: boolean;
  solved: boolean;
  acceptedReplyId: string | null;
  viewCount: number;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  lastActivityAt: string;
  liked: boolean;
  ownedByViewer: boolean;
  canModerate: boolean;
}

export interface ForumReply {
  id: string;
  author: ForumAuthor;
  content: string;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  liked: boolean;
  accepted: boolean;
  ownedByViewer: boolean;
  canModerate: boolean;
}

export interface ForumPage {
  threads: ForumThreadSummary[];
  nextCursor: string | null;
}

export interface ForumThreadDetail {
  thread: ForumThreadSummary;
  replies: ForumReply[];
}

export class ForumActionError extends Error {
  constructor(
    public readonly code:
      | "inactive"
      | "not-found"
      | "not-owner"
      | "not-visible"
      | "locked"
      | "already-reported"
      | "invalid-cursor"
      | "invalid-category"
      | "invalid-answer"
      | "admin-required",
  ) {
    super(code);
  }
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function timestamp(value: unknown): Timestamp {
  return value instanceof Timestamp ? value : Timestamp.fromMillis(0);
}

function author(uid: string, data: DocumentData | undefined): ForumAuthor {
  return {
    uid,
    displayName:
      typeof data?.displayName === "string" ? data.displayName : "Educator",
    photoURL: typeof data?.photoURL === "string" ? data.photoURL : null,
    gradeLevel:
      typeof data?.gradeLevel === "string" ? data.gradeLevel : "Educator",
    school: typeof data?.school === "string" ? data.school : "",
  };
}

function isPlatformAdmin(role: UserRole): boolean {
  return role === "platform_admin";
}

async function ensureDefaultForumCategories(): Promise<void> {
  const db = adminDb();
  const refs = DEFAULT_FORUM_CATEGORIES.map((category) =>
    db.doc(`forumCategories/${category.id}`),
  );
  const snapshots = await db.getAll(...refs);
  const missing = DEFAULT_FORUM_CATEGORIES.filter(
    (_, index) => !snapshots[index]?.exists,
  );
  if (!missing.length) return;

  const batch = db.batch();
  for (const category of missing) {
    batch.set(db.doc(`forumCategories/${category.id}`), {
      name: category.name,
      description: category.description,
      icon: category.icon,
      color: category.color,
      threadCount: 0,
      postCount: 0,
      order: category.order,
      active: true,
    });
  }
  await batch.commit();
}

export async function getForumCategories(): Promise<ForumCategory[]> {
  await ensureDefaultForumCategories();
  const snapshot = await adminDb()
    .collection("forumCategories")
    .where("active", "==", true)
    .orderBy("order", "asc")
    .limit(50)
    .get();
  return snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      name: String(data.name ?? "Forum category"),
      description: String(data.description ?? ""),
      icon: String(data.icon ?? "MessageSquare"),
      color: String(data.color ?? "#3B6B5C"),
      threadCount: count(data.threadCount),
      postCount: count(data.postCount),
    };
  });
}

async function hydrateThreads(
  viewerUid: string,
  viewerRole: UserRole,
  documents: DocumentSnapshot[],
): Promise<ForumThreadSummary[]> {
  if (!documents.length) return [];
  const db = adminDb();
  const authorIds = [
    ...new Set(documents.map((document) => String(document.data()!.authorId))),
  ];
  const categoryIds = [
    ...new Set(
      documents.map((document) => String(document.data()!.categoryId)),
    ),
  ];
  const [authors, categories, likes] = await Promise.all([
    db.getAll(...authorIds.map((uid) => db.doc(`users/${uid}`))),
    db.getAll(...categoryIds.map((id) => db.doc(`forumCategories/${id}`))),
    db.getAll(
      ...documents.map((document) =>
        db.doc(`forumLikes/thread_${document.id}_${viewerUid}`),
      ),
    ),
  ]);
  const authorMap = new Map(
    authors.map((snapshot) => [
      snapshot.id,
      author(snapshot.id, snapshot.data()),
    ]),
  );
  const categoryMap = new Map(
    categories.map((snapshot) => [snapshot.id, snapshot.data()]),
  );
  return documents.map((document, index) => {
    const data = document.data()!;
    const authorId = String(data.authorId);
    const categoryId = String(data.categoryId);
    return {
      id: document.id,
      author: authorMap.get(authorId) ?? author(authorId, undefined),
      category: {
        id: categoryId,
        name: String(categoryMap.get(categoryId)?.name ?? "Discussion"),
      },
      title: String(data.title ?? ""),
      content: String(data.content ?? ""),
      tags: strings(data.tags),
      pinned: data.pinned === true,
      locked: data.locked === true,
      solved: data.solved === true,
      acceptedReplyId:
        typeof data.acceptedReplyId === "string" ? data.acceptedReplyId : null,
      viewCount: count(data.viewCount),
      likeCount: count(data.likeCount),
      replyCount: count(data.replyCount),
      createdAt: timestamp(data.createdAt).toDate().toISOString(),
      updatedAt: timestamp(data.updatedAt).toDate().toISOString(),
      editedAt:
        data.editedAt instanceof Timestamp
          ? data.editedAt.toDate().toISOString()
          : null,
      lastActivityAt: timestamp(data.lastActivityAt).toDate().toISOString(),
      liked: likes[index]?.exists ?? false,
      ownedByViewer: authorId === viewerUid,
      canModerate: authorId === viewerUid || isPlatformAdmin(viewerRole),
    };
  });
}

export async function getForumPage(
  viewerUid: string,
  viewerRole: UserRole,
  query: ForumQuery,
): Promise<ForumPage> {
  const db = adminDb();
  let threads: Query = db
    .collection("forumThreads")
    .where("moderationStatus", "==", "approved");
  if (query.categoryId)
    threads = threads.where("categoryId", "==", query.categoryId);
  threads = threads
    .orderBy("lastActivityAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (query.cursor) {
    const cursor = decodeForumCursor(query.cursor);
    if (!cursor) throw new ForumActionError("invalid-cursor");
    threads = threads.startAfter(
      Timestamp.fromMillis(cursor.lastActivityAtMillis),
      cursor.documentId,
    );
  }
  const snapshot = await threads.limit(PAGE_SIZE + 1).get();
  const visible = snapshot.docs.slice(0, PAGE_SIZE);
  const last = visible.at(-1);
  return {
    threads: await hydrateThreads(viewerUid, viewerRole, visible),
    nextCursor:
      snapshot.size > PAGE_SIZE && last
        ? encodeForumCursor({
            lastActivityAtMillis: timestamp(
              last.data().lastActivityAt,
            ).toMillis(),
            documentId: last.id,
          })
        : null,
  };
}

export async function getForumThread(
  threadId: string,
  viewerUid: string,
  viewerRole: UserRole,
): Promise<ForumThreadDetail | null> {
  const db = adminDb();
  const threadRef = db.doc(`forumThreads/${threadId}`);
  const uniqueView = await db.runTransaction(async (transaction) => {
    const viewRef = db.doc(`forumViews/${threadId}_${viewerUid}`);
    const [thread, view] = await Promise.all([
      transaction.get(threadRef),
      transaction.get(viewRef),
    ]);
    if (!thread.exists || thread.data()?.moderationStatus !== "approved")
      return null;
    const counted = !view.exists;
    if (counted) {
      transaction.create(viewRef, {
        threadId,
        viewerUid,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(threadRef, { viewCount: FieldValue.increment(1) });
    }
    return { thread, counted };
  });
  if (!uniqueView) return null;
  const { thread, counted } = uniqueView;
  const replies = await threadRef
    .collection("replies")
    .where("moderationStatus", "==", "approved")
    .orderBy("createdAt", "asc")
    .limit(REPLY_LIMIT)
    .get();
  const authorIds = [
    ...new Set(replies.docs.map((reply) => String(reply.data().authorId))),
  ];
  const [threadSummary, authors, likes] = await Promise.all([
    hydrateThreads(viewerUid, viewerRole, [thread]),
    authorIds.length
      ? db.getAll(...authorIds.map((uid) => db.doc(`users/${uid}`)))
      : [],
    replies.docs.length
      ? db.getAll(
          ...replies.docs.map((reply) =>
            db.doc(`forumLikes/reply_${threadId}_${reply.id}_${viewerUid}`),
          ),
        )
      : [],
  ]);
  const authorMap = new Map(
    authors.map((snapshot) => [
      snapshot.id,
      author(snapshot.id, snapshot.data()),
    ]),
  );
  return {
    thread: {
      ...threadSummary[0]!,
      viewCount: count(thread.data()?.viewCount) + Number(counted),
    },
    replies: replies.docs.map((reply, index) => {
      const data = reply.data();
      const authorId = String(data.authorId);
      return {
        id: reply.id,
        author: authorMap.get(authorId) ?? author(authorId, undefined),
        content: String(data.content ?? ""),
        likeCount: count(data.likeCount),
        createdAt: timestamp(data.createdAt).toDate().toISOString(),
        updatedAt: timestamp(data.updatedAt).toDate().toISOString(),
        editedAt:
          data.editedAt instanceof Timestamp
            ? data.editedAt.toDate().toISOString()
            : null,
        liked: likes[index]?.exists ?? false,
        accepted: data.accepted === true,
        ownedByViewer: authorId === viewerUid,
        canModerate:
          authorId === viewerUid ||
          thread.data()?.authorId === viewerUid ||
          isPlatformAdmin(viewerRole),
      };
    }),
  };
}

export async function createForumThread(
  authorId: string,
  input: CreateForumThreadInput,
): Promise<string> {
  const db = adminDb();
  const threadRef = db.collection("forumThreads").doc();
  await db.runTransaction(async (transaction) => {
    const userRef = db.doc(`users/${authorId}`);
    const categoryRef = db.doc(`forumCategories/${input.categoryId}`);
    const [user, category] = await Promise.all([
      transaction.get(userRef),
      transaction.get(categoryRef),
    ]);
    if (!user.exists || user.data()?.status !== "active")
      throw new ForumActionError("inactive");
    if (!category.exists || category.data()?.active !== true)
      throw new ForumActionError("invalid-category");
    transaction.create(threadRef, {
      authorId,
      categoryId: input.categoryId,
      title: input.title,
      titleLower: input.title.toLocaleLowerCase("en-US"),
      content: input.content,
      tags: [
        ...new Set(input.tags.map((tag) => tag.toLocaleLowerCase("en-US"))),
      ],
      pinned: false,
      locked: false,
      solved: false,
      acceptedReplyId: null,
      viewCount: 0,
      likeCount: 0,
      replyCount: 0,
      reportCount: 0,
      moderationStatus: "approved",
      lastActivityAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(categoryRef, {
      threadCount: FieldValue.increment(1),
      postCount: FieldValue.increment(1),
    });
  });
  return threadRef.id;
}

export async function addForumReply(
  authorId: string,
  input: CreateForumReplyInput,
): Promise<string> {
  const db = adminDb();
  const threadRef = db.doc(`forumThreads/${input.threadId}`);
  const replyRef = threadRef.collection("replies").doc();
  await db.runTransaction(async (transaction) => {
    const userRef = db.doc(`users/${authorId}`);
    const [thread, user] = await Promise.all([
      transaction.get(threadRef),
      transaction.get(userRef),
    ]);
    if (!user.exists || user.data()?.status !== "active")
      throw new ForumActionError("inactive");
    if (!thread.exists || thread.data()?.moderationStatus !== "approved")
      throw new ForumActionError("not-found");
    if (thread.data()?.locked === true) throw new ForumActionError("locked");
    transaction.create(replyRef, {
      authorId,
      content: input.content,
      likeCount: 0,
      reportCount: 0,
      accepted: false,
      moderationStatus: "approved",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(threadRef, {
      replyCount: FieldValue.increment(1),
      lastActivityAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(db.doc(`forumCategories/${thread.data()?.categoryId}`), {
      postCount: FieldValue.increment(1),
    });
  });
  return replyRef.id;
}

export async function updateForumThread(
  uid: string,
  input: UpdateForumThreadInput,
): Promise<void> {
  const db = adminDb();
  const threadRef = db.doc(`forumThreads/${input.threadId}`);
  await db.runTransaction(async (transaction) => {
    const [thread, user] = await Promise.all([
      transaction.get(threadRef),
      transaction.get(db.doc(`users/${uid}`)),
    ]);
    if (!thread.exists) throw new ForumActionError("not-found");
    if (thread.data()?.authorId !== uid)
      throw new ForumActionError("not-owner");
    if (thread.data()?.locked === true) throw new ForumActionError("locked");
    if (!user.exists || user.data()?.status !== "active")
      throw new ForumActionError("inactive");
    transaction.update(threadRef, {
      title: input.title,
      titleLower: input.title.toLocaleLowerCase("en-US"),
      content: input.content,
      tags: [
        ...new Set(input.tags.map((tag) => tag.toLocaleLowerCase("en-US"))),
      ],
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastActivityAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function updateForumReply(
  uid: string,
  input: UpdateForumReplyInput,
): Promise<void> {
  const db = adminDb();
  const threadRef = db.doc(`forumThreads/${input.threadId}`);
  const replyRef = threadRef.collection("replies").doc(input.replyId);
  await db.runTransaction(async (transaction) => {
    const [thread, reply, user] = await Promise.all([
      transaction.get(threadRef),
      transaction.get(replyRef),
      transaction.get(db.doc(`users/${uid}`)),
    ]);
    if (!thread.exists || !reply.exists)
      throw new ForumActionError("not-found");
    if (thread.data()?.locked === true) throw new ForumActionError("locked");
    if (reply.data()?.authorId !== uid) throw new ForumActionError("not-owner");
    if (!user.exists || user.data()?.status !== "active")
      throw new ForumActionError("inactive");
    transaction.update(replyRef, {
      content: input.content,
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(threadRef, {
      lastActivityAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function setForumLiked(
  uid: string,
  threadId: string,
  replyId: string | null,
  liked: boolean,
): Promise<void> {
  const db = adminDb();
  const targetRef = replyId
    ? db.doc(`forumThreads/${threadId}/replies/${replyId}`)
    : db.doc(`forumThreads/${threadId}`);
  const targetKey = replyId
    ? `reply_${threadId}_${replyId}`
    : `thread_${threadId}`;
  const likeRef = db.doc(`forumLikes/${targetKey}_${uid}`);
  await db.runTransaction(async (transaction) => {
    const [target, like, user] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(likeRef),
      transaction.get(db.doc(`users/${uid}`)),
    ]);
    if (!user.exists || user.data()?.status !== "active")
      throw new ForumActionError("inactive");
    if (!target.exists || target.data()?.moderationStatus !== "approved")
      throw new ForumActionError("not-found");
    if (liked === like.exists) return;
    if (liked)
      transaction.create(likeRef, {
        uid,
        threadId,
        replyId,
        targetType: replyId ? "forumReply" : "forumThread",
        createdAt: FieldValue.serverTimestamp(),
      });
    else transaction.delete(likeRef);
    transaction.update(targetRef, {
      likeCount: Math.max(
        0,
        count(target.data()?.likeCount) + (liked ? 1 : -1),
      ),
    });
  });
}

export async function reportForumContent(
  reporterId: string,
  input: ForumReportInput,
): Promise<void> {
  const db = adminDb();
  const targetRef = input.replyId
    ? db.doc(`forumThreads/${input.threadId}/replies/${input.replyId}`)
    : db.doc(`forumThreads/${input.threadId}`);
  const targetKey = input.replyId
    ? `forumReply_${input.threadId}_${input.replyId}`
    : `forumThread_${input.threadId}`;
  const reportRef = db.doc(`reports/${targetKey}_${reporterId}`);
  await db.runTransaction(async (transaction) => {
    const [target, report] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(reportRef),
    ]);
    if (!target.exists || target.data()?.moderationStatus !== "approved")
      throw new ForumActionError("not-found");
    if (report.exists) throw new ForumActionError("already-reported");
    transaction.create(reportRef, {
      reporterId,
      targetType: input.replyId ? "forumReply" : "forumThread",
      targetId: input.replyId ?? input.threadId,
      parentId: input.replyId ? input.threadId : null,
      targetOwnerId: String(target.data()?.authorId ?? ""),
      reason: input.reason,
      details: input.details,
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(targetRef, { reportCount: FieldValue.increment(1) });
  });
}

export async function acceptForumReply(
  uid: string,
  role: UserRole,
  threadId: string,
  replyId: string,
): Promise<void> {
  const db = adminDb();
  const threadRef = db.doc(`forumThreads/${threadId}`);
  const replyRef = threadRef.collection("replies").doc(replyId);
  await db.runTransaction(async (transaction) => {
    const [thread, reply] = await Promise.all([
      transaction.get(threadRef),
      transaction.get(replyRef),
    ]);
    if (!thread.exists || !reply.exists)
      throw new ForumActionError("not-found");
    if (thread.data()?.authorId !== uid && !isPlatformAdmin(role))
      throw new ForumActionError("not-owner");
    if (reply.data()?.moderationStatus !== "approved")
      throw new ForumActionError("invalid-answer");
    const previousReplyId = thread.data()?.acceptedReplyId;
    if (typeof previousReplyId === "string" && previousReplyId !== replyId)
      transaction.update(threadRef.collection("replies").doc(previousReplyId), {
        accepted: false,
      });
    transaction.update(replyRef, { accepted: true });
    transaction.update(threadRef, {
      solved: true,
      acceptedReplyId: replyId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function moderateForumThread(
  uid: string,
  role: UserRole,
  input: ForumModerationInput,
): Promise<void> {
  const db = adminDb();
  const threadRef = db.doc(`forumThreads/${input.threadId}`);
  let categoryId = "";
  let replyCount = 0;
  await db.runTransaction(async (transaction) => {
    const thread = await transaction.get(threadRef);
    if (!thread.exists) throw new ForumActionError("not-found");
    const owned = thread.data()?.authorId === uid;
    const admin = isPlatformAdmin(role);
    if (!owned && !admin) throw new ForumActionError("not-owner");
    if ((input.action === "pin" || input.action === "unpin") && !admin)
      throw new ForumActionError("admin-required");
    if (input.action === "delete") {
      categoryId = String(thread.data()?.categoryId ?? "");
      replyCount = count(thread.data()?.replyCount);
      transaction.delete(threadRef);
      if (categoryId)
        transaction.update(db.doc(`forumCategories/${categoryId}`), {
          threadCount: FieldValue.increment(-1),
          postCount: FieldValue.increment(-(replyCount + 1)),
        });
      return;
    }
    transaction.update(threadRef, {
      ...(input.action === "pin" || input.action === "unpin"
        ? { pinned: input.action === "pin" }
        : { locked: input.action === "lock" }),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  if (input.action !== "delete") return;
  const [likes, views, replyReports, threadReports] = await Promise.all([
    db.collection("forumLikes").where("threadId", "==", input.threadId).get(),
    db.collection("forumViews").where("threadId", "==", input.threadId).get(),
    db.collection("reports").where("parentId", "==", input.threadId).get(),
    db.collection("reports").where("targetId", "==", input.threadId).get(),
    db.recursiveDelete(threadRef),
  ]);
  const writer = db.bulkWriter();
  for (const document of [
    ...likes.docs,
    ...views.docs,
    ...replyReports.docs,
    ...threadReports.docs,
  ])
    writer.delete(document.ref);
  await writer.close();
}

export async function deleteForumReply(
  uid: string,
  role: UserRole,
  threadId: string,
  replyId: string,
): Promise<void> {
  const db = adminDb();
  const threadRef = db.doc(`forumThreads/${threadId}`);
  const replyRef = threadRef.collection("replies").doc(replyId);
  await db.runTransaction(async (transaction) => {
    const [thread, reply] = await Promise.all([
      transaction.get(threadRef),
      transaction.get(replyRef),
    ]);
    if (!thread.exists || !reply.exists)
      throw new ForumActionError("not-found");
    const permitted =
      reply.data()?.authorId === uid ||
      thread.data()?.authorId === uid ||
      isPlatformAdmin(role);
    if (!permitted) throw new ForumActionError("not-owner");
    transaction.delete(replyRef);
    transaction.update(threadRef, {
      replyCount: Math.max(0, count(thread.data()?.replyCount) - 1),
      ...(thread.data()?.acceptedReplyId === replyId
        ? { solved: false, acceptedReplyId: null }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(db.doc(`forumCategories/${thread.data()?.categoryId}`), {
      postCount: FieldValue.increment(-1),
    });
  });
  const [likes, reports] = await Promise.all([
    db.collection("forumLikes").where("replyId", "==", replyId).get(),
    db.collection("reports").where("targetId", "==", replyId).get(),
  ]);
  const writer = db.bulkWriter();
  for (const document of [...likes.docs, ...reports.docs])
    writer.delete(document.ref);
  await writer.close();
}
