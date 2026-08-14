import "server-only";

import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import { decodeFeedCursor, encodeFeedCursor } from "@/lib/feed/cursor";
import { adminDb } from "@/lib/firebase/admin";
import {
  mentionsFromData,
  resolveMentions,
  writeMentionNotifications,
} from "@/lib/mentions/server";
import type { MentionTarget } from "@/lib/mentions/types";
import { getAcceptedConnectionUids } from "@/lib/network/server";
import type {
  CreateCommentInput,
  CreatePostInput,
  FeedView,
  ReportPostInput,
  UpdateCommentInput,
  UpdatePostInput,
} from "@/schemas/feed";

const PAGE_SIZE = 10;
const FOLLOWING_SCAN_LIMIT = 100;

export interface FeedAuthor {
  uid: string;
  displayName: string;
  photoURL: string | null;
  gradeLevel: string;
  school: string;
}

export interface FeedPost {
  id: string;
  author: FeedAuthor;
  type: CreatePostInput["type"];
  content: string;
  imageURLs: string[];
  tags: string[];
  mentions: MentionTarget[];
  resourceId: string | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  bookmarkCount: number;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  liked: boolean;
  bookmarked: boolean;
  ownedByViewer: boolean;
}

export interface FeedPage {
  posts: FeedPost[];
  nextCursor: string | null;
}

export interface ProfilePostPage {
  posts: FeedPost[];
  total: number;
}

export interface FeedComment {
  id: string;
  author: FeedAuthor;
  content: string;
  mentions: MentionTarget[];
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  ownedByViewer: boolean;
}

export class FeedActionError extends Error {
  constructor(
    public readonly code:
      | "inactive"
      | "not-found"
      | "not-owner"
      | "not-visible"
      | "already-reported"
      | "invalid-cursor",
  ) {
    super(code);
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function nonnegativeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function authorFromData(
  uid: string,
  data: DocumentData | undefined,
): FeedAuthor {
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

function postTimestamp(document: DocumentSnapshot): Timestamp {
  const value = document.data()!.createdAt;
  return value instanceof Timestamp ? value : Timestamp.fromMillis(0);
}

function timestamp(value: unknown): Timestamp {
  return value instanceof Timestamp ? value : Timestamp.fromMillis(0);
}

async function hydratePosts(
  viewerUid: string,
  documents: DocumentSnapshot[],
): Promise<FeedPost[]> {
  if (!documents.length) return [];
  const db = adminDb();
  const authorIds = [
    ...new Set(documents.map((document) => String(document.data()!.authorId))),
  ];
  const [authorSnapshots, likeSnapshots, bookmarkSnapshots] = await Promise.all(
    [
      db.getAll(...authorIds.map((uid) => db.doc(`users/${uid}`))),
      db.getAll(
        ...documents.map((document) =>
          db.doc(`postLikes/${document.id}_${viewerUid}`),
        ),
      ),
      db.getAll(
        ...documents.map((document) =>
          db.doc(`postBookmarks/${viewerUid}_${document.id}`),
        ),
      ),
    ],
  );
  const authors = new Map(
    authorSnapshots.map((snapshot) => [
      snapshot.id,
      authorFromData(snapshot.id, snapshot.data()),
    ]),
  );

  return documents.map((document, index) => {
    const data = document.data()!;
    const authorId = String(data.authorId);
    const createdAt = postTimestamp(document);
    return {
      id: document.id,
      author: authors.get(authorId) ?? authorFromData(authorId, undefined),
      type:
        data.type === "question" || data.type === "resource"
          ? data.type
          : "post",
      content: String(data.content ?? ""),
      imageURLs: stringArray(data.imageURLs),
      tags: stringArray(data.tags),
      mentions: mentionsFromData(data.mentions),
      resourceId: typeof data.resourceId === "string" ? data.resourceId : null,
      likeCount: nonnegativeCount(data.likeCount),
      commentCount: nonnegativeCount(data.commentCount),
      shareCount: nonnegativeCount(data.shareCount),
      bookmarkCount: nonnegativeCount(data.bookmarkCount),
      createdAt: createdAt.toDate().toISOString(),
      updatedAt: timestamp(data.updatedAt).toDate().toISOString(),
      editedAt:
        data.editedAt instanceof Timestamp
          ? data.editedAt.toDate().toISOString()
          : null,
      liked: likeSnapshots[index]?.exists ?? false,
      bookmarked: bookmarkSnapshots[index]?.exists ?? false,
      ownedByViewer: authorId === viewerUid,
    };
  });
}

export async function getPost(
  viewerUid: string,
  postId: string,
): Promise<FeedPost | null> {
  const snapshot = await adminDb().doc(`posts/${postId}`).get();
  if (!snapshot.exists) return null;
  if (
    snapshot.data()?.moderationStatus !== "approved" &&
    snapshot.data()?.authorId !== viewerUid
  )
    return null;
  return (await hydratePosts(viewerUid, [snapshot]))[0] ?? null;
}

function applyCursor(query: Query, encodedCursor: string | undefined): Query {
  if (!encodedCursor) return query;
  const cursor = decodeFeedCursor(encodedCursor);
  if (!cursor) throw new FeedActionError("invalid-cursor");
  return query.startAfter(
    Timestamp.fromMillis(cursor.createdAtMillis),
    cursor.documentId,
  );
}

export async function getFeedPage(
  viewerUid: string,
  view: FeedView,
  encodedCursor?: string,
): Promise<FeedPage> {
  const db = adminDb();
  if (view === "saved") {
    let bookmarks: Query = db
      .collection("postBookmarks")
      .where("uid", "==", viewerUid)
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    bookmarks = applyCursor(bookmarks, encodedCursor).limit(PAGE_SIZE + 1);
    const snapshot = await bookmarks.get();
    const visible = snapshot.docs.slice(0, PAGE_SIZE);
    const postSnapshots = visible.length
      ? await db.getAll(
          ...visible.map((bookmark) =>
            db.doc(`posts/${bookmark.data().postId}`),
          ),
        )
      : [];
    const posts = await hydratePosts(
      viewerUid,
      postSnapshots.filter(
        (post): post is QueryDocumentSnapshot =>
          post.exists && post.data()?.moderationStatus === "approved",
      ),
    );
    const last = visible.at(-1);
    return {
      posts,
      nextCursor:
        snapshot.size > PAGE_SIZE && last
          ? encodeFeedCursor({
              createdAtMillis: postTimestamp(last).toMillis(),
              documentId: last.id,
            })
          : null,
    };
  }

  let postsQuery: Query = db
    .collection("posts")
    .where("moderationStatus", "==", "approved")
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  postsQuery = applyCursor(postsQuery, encodedCursor);

  let followingIds: Set<string> | null = null;
  if (view === "following") {
    followingIds = await getAcceptedConnectionUids(viewerUid);
  }

  const snapshot = await postsQuery
    .limit(view === "following" ? FOLLOWING_SCAN_LIMIT : PAGE_SIZE + 1)
    .get();
  const matching = followingIds
    ? snapshot.docs.filter((document) =>
        followingIds.has(String(document.data().authorId)),
      )
    : snapshot.docs;
  const visible = matching.slice(0, PAGE_SIZE);
  const hasMore =
    matching.length > PAGE_SIZE ||
    (view === "following" && snapshot.size === FOLLOWING_SCAN_LIMIT);
  const last =
    matching.length > PAGE_SIZE
      ? visible.at(-1)
      : view === "following"
        ? snapshot.docs.at(-1)
        : visible.at(-1);
  return {
    posts: await hydratePosts(viewerUid, visible),
    nextCursor:
      hasMore && last
        ? encodeFeedCursor({
            createdAtMillis: postTimestamp(last).toMillis(),
            documentId: last.id,
          })
        : null,
  };
}

export async function getProfilePosts(
  viewerUid: string,
  profileUid: string,
): Promise<ProfilePostPage> {
  const snapshot = await adminDb()
    .collection("posts")
    .where("authorId", "==", profileUid)
    .get();
  const visible = snapshot.docs
    .filter((document) => document.data().moderationStatus === "approved")
    .sort(
      (left, right) =>
        postTimestamp(right).toMillis() - postTimestamp(left).toMillis(),
    );

  return {
    posts: await hydratePosts(viewerUid, visible.slice(0, 20)),
    total: visible.length,
  };
}

export async function createPost(
  authorId: string,
  input: CreatePostInput,
): Promise<string> {
  const db = adminDb();
  const postRef = db.collection("posts").doc();
  await db.runTransaction(async (transaction) => {
    const authorRef = db.doc(`users/${authorId}`);
    const author = await transaction.get(authorRef);
    if (!author.exists || author.data()?.status !== "active")
      throw new FeedActionError("inactive");
    const mentions = await resolveMentions(transaction, input.mentionUids);
    const actorName = String(author.data()?.displayName ?? "An educator");
    transaction.create(postRef, {
      authorId,
      type: input.type,
      content: input.content,
      imageURLs: input.imageURLs,
      tags: [...new Set(input.tags.map((tag) => tag.toLowerCase()))],
      mentions,
      resourceId: input.type === "resource" ? input.resourceId : null,
      visibility: "public",
      moderationStatus: "approved",
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      bookmarkCount: 0,
      reportCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeMentionNotifications(transaction, {
      mentions,
      actorId: authorId,
      actorName,
      entityId: postRef.id,
      entityKey: `post_${postRef.id}`,
      context: "post",
      href: `/post/${postRef.id}`,
    });
    transaction.update(authorRef, { postCount: FieldValue.increment(1) });
  });
  return postRef.id;
}

export async function updatePost(
  uid: string,
  input: UpdatePostInput,
): Promise<void> {
  const db = adminDb();
  const postRef = db.doc(`posts/${input.postId}`);
  await db.runTransaction(async (transaction) => {
    const [post, user] = await Promise.all([
      transaction.get(postRef),
      transaction.get(db.doc(`users/${uid}`)),
    ]);
    if (!post.exists) throw new FeedActionError("not-found");
    if (post.data()?.authorId !== uid) throw new FeedActionError("not-owner");
    if (!user.exists || user.data()?.status !== "active")
      throw new FeedActionError("inactive");
    transaction.update(postRef, {
      type: input.type,
      content: input.content,
      imageURLs: input.imageURLs,
      tags: [...new Set(input.tags.map((tag) => tag.toLowerCase()))],
      resourceId: input.type === "resource" ? input.resourceId : null,
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function assertVisiblePost(
  transaction: FirebaseFirestore.Transaction,
  postRef: FirebaseFirestore.DocumentReference,
) {
  const post = await transaction.get(postRef);
  if (!post.exists) throw new FeedActionError("not-found");
  if (post.data()?.moderationStatus !== "approved")
    throw new FeedActionError("not-visible");
  return post;
}

export async function setPostLiked(
  uid: string,
  postId: string,
  liked: boolean,
): Promise<void> {
  const db = adminDb();
  await db.runTransaction(async (transaction) => {
    const postRef = db.doc(`posts/${postId}`);
    const likeRef = db.doc(`postLikes/${postId}_${uid}`);
    const actorRef = db.doc(`users/${uid}`);
    const [post, like, actor] = await Promise.all([
      assertVisiblePost(transaction, postRef),
      transaction.get(likeRef),
      transaction.get(actorRef),
    ]);
    if (liked === like.exists) return;
    if (liked) {
      transaction.create(likeRef, {
        postId,
        uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    } else transaction.delete(likeRef);
    transaction.update(postRef, {
      likeCount: Math.max(
        0,
        nonnegativeCount(post.data()?.likeCount) + (liked ? 1 : -1),
      ),
    });
    const ownerId = String(post.data()?.authorId ?? "");
    if (ownerId && ownerId !== uid) {
      const notificationRef = db.doc(
        `users/${ownerId}/notifications/post-like_${postId}_${uid}`,
      );
      if (liked) {
        transaction.set(notificationRef, {
          type: "post-like",
          actorId: uid,
          actorName: String(actor.data()?.displayName ?? "An educator"),
          entityId: postId,
          message: `${String(actor.data()?.displayName ?? "An educator")} liked your post.`,
          href: `/post/${postId}`,
          read: false,
          archived: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else transaction.delete(notificationRef);
    }
  });
}

export async function setPostBookmarked(
  uid: string,
  postId: string,
  bookmarked: boolean,
): Promise<void> {
  const db = adminDb();
  await db.runTransaction(async (transaction) => {
    const postRef = db.doc(`posts/${postId}`);
    const bookmarkRef = db.doc(`postBookmarks/${uid}_${postId}`);
    const [post, bookmark] = await Promise.all([
      assertVisiblePost(transaction, postRef),
      transaction.get(bookmarkRef),
    ]);
    if (bookmarked === bookmark.exists) return;
    if (bookmarked)
      transaction.create(bookmarkRef, {
        postId,
        uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    else transaction.delete(bookmarkRef);
    transaction.update(postRef, {
      bookmarkCount: Math.max(
        0,
        nonnegativeCount(post.data()?.bookmarkCount) + (bookmarked ? 1 : -1),
      ),
    });
  });
}

export async function addPostComment(
  uid: string,
  input: CreateCommentInput,
): Promise<string> {
  const db = adminDb();
  const commentRef = db.collection(`posts/${input.postId}/comments`).doc();
  await db.runTransaction(async (transaction) => {
    const postRef = db.doc(`posts/${input.postId}`);
    const userRef = db.doc(`users/${uid}`);
    const [post, user] = await Promise.all([
      assertVisiblePost(transaction, postRef),
      transaction.get(userRef),
    ]);
    if (!user.exists || user.data()?.status !== "active")
      throw new FeedActionError("inactive");
    const mentions = await resolveMentions(transaction, input.mentionUids);
    const actorName = String(user.data()?.displayName ?? "An educator");
    transaction.create(commentRef, {
      authorId: uid,
      content: input.content,
      mentions,
      moderationStatus: "approved",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeMentionNotifications(transaction, {
      mentions,
      actorId: uid,
      actorName,
      entityId: input.postId,
      entityKey: `comment_${commentRef.id}`,
      context: "comment",
      href: `/post/${input.postId}#comment-${commentRef.id}`,
    });
    transaction.update(postRef, {
      commentCount: nonnegativeCount(post.data()?.commentCount) + 1,
    });
    const ownerId = String(post.data()?.authorId ?? "");
    if (ownerId && ownerId !== uid) {
      transaction.create(
        db.doc(`users/${ownerId}/notifications/post-comment_${commentRef.id}`),
        {
          type: "post-comment",
          actorId: uid,
          actorName,
          entityId: input.postId,
          message: `${actorName} commented on your post.`,
          href: `/post/${input.postId}#comment-${commentRef.id}`,
          read: false,
          archived: false,
          createdAt: FieldValue.serverTimestamp(),
        },
      );
    }
  });
  return commentRef.id;
}

export async function getPostComments(
  viewerUid: string,
  postId: string,
): Promise<FeedComment[]> {
  const db = adminDb();
  const post = await db.doc(`posts/${postId}`).get();
  if (!post.exists) throw new FeedActionError("not-found");
  if (
    post.data()?.moderationStatus !== "approved" &&
    post.data()?.authorId !== viewerUid
  )
    throw new FeedActionError("not-visible");
  const comments = await db
    .collection(`posts/${postId}/comments`)
    .where("moderationStatus", "==", "approved")
    .orderBy("createdAt", "asc")
    .limit(50)
    .get();
  const authorIds = [
    ...new Set(comments.docs.map((comment) => String(comment.data().authorId))),
  ];
  const authors = authorIds.length
    ? await db.getAll(...authorIds.map((uid) => db.doc(`users/${uid}`)))
    : [];
  const authorMap = new Map(
    authors.map((author) => [
      author.id,
      authorFromData(author.id, author.data()),
    ]),
  );
  return comments.docs.map((comment) => {
    const data = comment.data();
    const authorId = String(data.authorId);
    const createdAt =
      data.createdAt instanceof Timestamp
        ? data.createdAt
        : Timestamp.fromMillis(0);
    return {
      id: comment.id,
      author: authorMap.get(authorId) ?? authorFromData(authorId, undefined),
      content: String(data.content ?? ""),
      mentions: mentionsFromData(data.mentions),
      createdAt: createdAt.toDate().toISOString(),
      updatedAt: timestamp(data.updatedAt).toDate().toISOString(),
      editedAt:
        data.editedAt instanceof Timestamp
          ? data.editedAt.toDate().toISOString()
          : null,
      ownedByViewer: authorId === viewerUid,
    };
  });
}

export async function updatePostComment(
  uid: string,
  input: UpdateCommentInput,
): Promise<void> {
  const db = adminDb();
  const postRef = db.doc(`posts/${input.postId}`);
  const commentRef = postRef.collection("comments").doc(input.commentId);
  await db.runTransaction(async (transaction) => {
    const [post, comment] = await Promise.all([
      assertVisiblePost(transaction, postRef),
      transaction.get(commentRef),
    ]);
    if (!post.exists || !comment.exists) throw new FeedActionError("not-found");
    if (comment.data()?.authorId !== uid)
      throw new FeedActionError("not-owner");
    transaction.update(commentRef, {
      content: input.content,
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function deletePostComment(
  uid: string,
  postId: string,
  commentId: string,
): Promise<void> {
  const db = adminDb();
  const postRef = db.doc(`posts/${postId}`);
  const commentRef = postRef.collection("comments").doc(commentId);
  await db.runTransaction(async (transaction) => {
    const [post, comment] = await Promise.all([
      transaction.get(postRef),
      transaction.get(commentRef),
    ]);
    if (!post.exists || !comment.exists) throw new FeedActionError("not-found");
    if (comment.data()?.authorId !== uid)
      throw new FeedActionError("not-owner");
    transaction.delete(commentRef);
    transaction.update(postRef, {
      commentCount: Math.max(
        0,
        nonnegativeCount(post.data()?.commentCount) - 1,
      ),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function reportPost(
  reporterId: string,
  input: ReportPostInput,
): Promise<void> {
  const db = adminDb();
  await db.runTransaction(async (transaction) => {
    const postRef = db.doc(`posts/${input.postId}`);
    const reportRef = db.doc(`reports/post_${input.postId}_${reporterId}`);
    const [post, report] = await Promise.all([
      assertVisiblePost(transaction, postRef),
      transaction.get(reportRef),
    ]);
    if (report.exists) throw new FeedActionError("already-reported");
    transaction.create(reportRef, {
      reporterId,
      targetType: "post",
      targetId: input.postId,
      targetOwnerId: String(post.data()?.authorId ?? ""),
      reason: input.reason,
      details: input.details,
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(postRef, { reportCount: FieldValue.increment(1) });
  });
}

export async function deletePost(uid: string, postId: string): Promise<void> {
  const db = adminDb();
  const postRef = db.doc(`posts/${postId}`);
  await db.runTransaction(async (transaction) => {
    const post = await transaction.get(postRef);
    if (!post.exists) throw new FeedActionError("not-found");
    if (post.data()?.authorId !== uid) throw new FeedActionError("not-owner");
    transaction.delete(postRef);
    transaction.update(db.doc(`users/${uid}`), {
      postCount: FieldValue.increment(-1),
    });
  });

  const [likes, bookmarks, reports] = await Promise.all([
    db.collection("postLikes").where("postId", "==", postId).get(),
    db.collection("postBookmarks").where("postId", "==", postId).get(),
    db.collection("reports").where("targetId", "==", postId).get(),
    db.recursiveDelete(postRef),
  ]);
  const writer = db.bulkWriter();
  for (const document of [...likes.docs, ...bookmarks.docs, ...reports.docs])
    writer.delete(document.ref);
  await writer.close();
}
