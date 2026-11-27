import "server-only";

import {
  prepareCommunityNotifications,
  writeCommunityNotification,
} from "@/lib/notifications/delivery";

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
import { publicActivityIds } from "@/lib/community/visibility";
import {
  ContentReportError,
  reportPublicContent,
} from "@/lib/community/reporting";
import { adminDb } from "@/lib/firebase/admin";
import {
  preparePostMedia,
  presentPostMedia,
  readPostMediaClaims,
} from "@/lib/feed/attachment-server";
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
  PostFileAttachment,
  ReportPostInput,
  UpdateCommentInput,
  UpdatePostInput,
} from "@/schemas/feed";
import { postFileAttachmentSchema } from "@/schemas/feed";

const PAGE_SIZE = 10;

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
  type: CreatePostInput["type"] | "activity";
  content: string;
  imageURLs: string[];
  fileAttachments: PostFileAttachment[];
  linkURLs: string[];
  tags: string[];
  mentions: MentionTarget[];
  resourceId: string | null;
  activity: {
    kind: "forum-thread" | "lesson-published" | "resource-published";
    label: string;
    title: string;
    href: string;
  } | null;
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

export interface PublicActivityInput {
  authorId: string;
  kind: NonNullable<FeedPost["activity"]>["kind"];
  entityId: string;
  label: string;
  title: string;
  href: string;
  tags: string[];
}

export function publicActivityRef(
  input: Pick<PublicActivityInput, "kind" | "entityId">,
) {
  return adminDb().doc(`posts/activity_${input.kind}_${input.entityId}`);
}

export function writePublicActivity(
  transaction: FirebaseFirestore.Transaction,
  input: PublicActivityInput,
  existing: FirebaseFirestore.DocumentSnapshot,
): FirebaseFirestore.DocumentReference {
  const activityRef = publicActivityRef(input);
  if (existing.ref.path !== activityRef.path)
    throw new Error("Activity snapshot mismatch.");
  const metadata = {
    authorId: input.authorId,
    type: "activity",
    tags: [...new Set(input.tags.map((tag) => tag.toLocaleLowerCase("en-US")))],
    activityKind: input.kind,
    activityEntityId: input.entityId,
    activityLabel: input.label,
    activityTitle: input.title,
    activityHref: input.href,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (existing.exists) transaction.update(activityRef, metadata);
  else
    transaction.create(activityRef, {
      ...metadata,
      content: "",
      imageURLs: [],
      fileAttachments: [],
      linkURLs: [],
      mentions: [],
      resourceId: null,
      visibility: "public",
      moderationStatus: "approved",
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      bookmarkCount: 0,
      reportCount: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
  return activityRef;
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
      | "not-interactive"
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

function fileAttachmentArray(value: unknown): PostFileAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = postFileAttachmentSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
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

async function publicPostIds(
  posts: DocumentSnapshot[],
  transaction?: FirebaseFirestore.Transaction,
): Promise<Set<string>> {
  const activities = await publicActivityIds(posts, transaction);
  return new Set(
    posts
      .filter(
        (post) =>
          post.exists &&
          post.data()?.moderationStatus === "approved" &&
          (post.data()?.type !== "activity" || activities.has(post.id)),
      )
      .map((post) => post.id),
  );
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
    const media = presentPostMedia(
      document.id,
      authorId,
      stringArray(data.imageURLs),
      fileAttachmentArray(data.fileAttachments),
    );
    return {
      id: document.id,
      author: authors.get(authorId) ?? authorFromData(authorId, undefined),
      type:
        data.type === "question" ||
        data.type === "resource" ||
        data.type === "activity"
          ? data.type
          : "post",
      content: String(data.content ?? ""),
      imageURLs: media.imageURLs,
      fileAttachments: media.fileAttachments,
      linkURLs: stringArray(data.linkURLs),
      tags: stringArray(data.tags),
      mentions: mentionsFromData(data.mentions),
      resourceId: typeof data.resourceId === "string" ? data.resourceId : null,
      activity:
        data.type === "activity" &&
        (data.activityKind === "forum-thread" ||
          data.activityKind === "lesson-published" ||
          data.activityKind === "resource-published") &&
        typeof data.activityLabel === "string" &&
        typeof data.activityTitle === "string" &&
        typeof data.activityHref === "string"
          ? {
              kind: data.activityKind,
              label: data.activityLabel,
              title: data.activityTitle,
              href: data.activityHref,
            }
          : null,
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

/** Shared parent policy for page hydration and transactional byte delivery. */
export async function readVisiblePost(
  viewerUid: string,
  postId: string,
  transaction?: FirebaseFirestore.Transaction,
): Promise<DocumentSnapshot | null> {
  const ref = adminDb().doc(`posts/${postId}`);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  if (!snapshot.exists) return null;
  if (
    snapshot.data()?.type === "activity" &&
    !(await publicPostIds([snapshot], transaction)).has(snapshot.id)
  )
    return null;
  if (
    snapshot.data()?.moderationStatus !== "approved" &&
    snapshot.data()?.authorId !== viewerUid
  )
    return null;
  return snapshot;
}

export async function getPost(
  viewerUid: string,
  postId: string,
): Promise<FeedPost | null> {
  const snapshot = await readVisiblePost(viewerUid, postId);
  return snapshot
    ? ((await hydratePosts(viewerUid, [snapshot]))[0] ?? null)
    : null;
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

/** Consume raw rows, including hidden sources, without skipping unconsumed rows. */
async function scanFeedRows(
  base: Query,
  viewerUid: string,
  encodedCursor: string | undefined,
  resolve: (
    rows: QueryDocumentSnapshot[],
  ) => Promise<Map<string, DocumentSnapshot>>,
): Promise<FeedPage> {
  const batchSize = 40;
  const scanBudget = 200;
  let scanned = 0;
  let query = applyCursor(base, encodedCursor);
  let lastConsumed: QueryDocumentSnapshot | undefined;
  let exhausted = false;
  const selected: DocumentSnapshot[] = [];
  const selectedIds = new Set<string>();
  while (selected.length < PAGE_SIZE && scanned < scanBudget) {
    const requested = Math.min(batchSize, scanBudget - scanned);
    const batch = await query.limit(requested).get();
    scanned += batch.size;
    if (!batch.size) {
      exhausted = true;
      break;
    }
    const mapped = await resolve(batch.docs);
    const visible = await publicPostIds([...mapped.values()]);
    let consumed = 0;
    for (const row of batch.docs) {
      lastConsumed = row;
      consumed++;
      const post = mapped.get(row.id);
      if (post && visible.has(post.id) && !selectedIds.has(post.id)) {
        selected.push(post);
        selectedIds.add(post.id);
      }
      if (selected.length === PAGE_SIZE) break;
    }
    if (selected.length === PAGE_SIZE) {
      exhausted = consumed === batch.size && batch.size < requested;
      break;
    }
    if (batch.size < requested) {
      exhausted = true;
      break;
    }
    const last = batch.docs.at(-1)!;
    query = base.startAfter(postTimestamp(last), last.id);
  }
  return {
    posts: await hydratePosts(viewerUid, selected),
    nextCursor:
      !exhausted && lastConsumed
        ? encodeFeedCursor({
            createdAtMillis: postTimestamp(lastConsumed).toMillis(),
            documentId: lastConsumed.id,
          })
        : null,
  };
}

export async function getFeedPage(
  viewerUid: string,
  view: FeedView,
  encodedCursor?: string,
): Promise<FeedPage> {
  const db = adminDb();
  if (view === "saved") {
    const base = db
      .collection("postBookmarks")
      .where("uid", "==", viewerUid)
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    return scanFeedRows(base, viewerUid, encodedCursor, async (rows) => {
      const usable = rows.filter(
        (row) =>
          typeof row.data().postId === "string" &&
          /^[\w-]{1,128}$/.test(row.data().postId),
      );
      const posts = usable.length
        ? await db.getAll(
            ...usable.map((row) => db.doc(`posts/${row.data().postId}`)),
          )
        : [];
      return new Map(usable.map((row, index) => [row.id, posts[index]]));
    });
  }
  const following =
    view === "following" ? await getAcceptedConnectionUids(viewerUid) : null;
  const base = db
    .collection("posts")
    .where("moderationStatus", "==", "approved")
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  return scanFeedRows(
    base,
    viewerUid,
    encodedCursor,
    async (rows) =>
      new Map(
        rows
          .filter(
            (post) => !following || following.has(String(post.data().authorId)),
          )
          .map((post) => [post.id, post]),
      ),
  );
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
    .filter(
      (document) =>
        document.data().moderationStatus === "approved" &&
        document.data().type !== "activity",
    )
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
  const resourceDraftRef = db.doc(`resources/post_${postRef.id}`);
  const media = await preparePostMedia(authorId, input);
  await db.runTransaction(async (transaction) => {
    const authorRef = db.doc(`users/${authorId}`);
    const author = await transaction.get(authorRef);
    if (!author.exists || author.data()?.status !== "active")
      throw new FeedActionError("inactive");
    const mentions = await resolveMentions(transaction, input.mentionUids);
    const actorName = String(author.data()?.displayName ?? "An educator");
    const tags = [
      ...new Set(input.tags.map((tag) => tag.toLocaleLowerCase("en-US"))),
    ];
    const recipients = await prepareCommunityNotifications(
      transaction,
      authorId,
      [...mentions.map((mention) => mention.uid)],
    );
    const claimMedia = await readPostMediaClaims(
      transaction,
      authorId,
      postRef.id,
      media,
    );
    claimMedia();
    transaction.create(postRef, {
      authorId,
      type: input.type,
      content: input.content,
      imageURLs: media.imageURLs,
      fileAttachments: media.fileAttachments,
      linkURLs: input.linkURLs,
      tags,
      mentions,
      resourceId: input.type === "resource" ? input.resourceId : null,
      activity: null,
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
      recipients,
      mentions,
      actorId: authorId,
      actorName,
      entityId: postRef.id,
      entityKey: `post_${postRef.id}`,
      context: "post",
      href: `/post/${postRef.id}`,
    });
    const createsResourceDraft =
      !input.resourceId &&
      tags.some((tag) => tag === "resource" || tag === "resources");
    if (createsResourceDraft) {
      const firstLine = input.content.split(/\r?\n/u)[0]?.trim() ?? "";
      const title =
        firstLine.length >= 3
          ? firstLine.slice(0, 140)
          : "Resource shared from a post";
      transaction.create(resourceDraftRef, {
        authorId,
        sourcePostId: postRef.id,
        completionStatus: "incomplete",
        title,
        titleLower: title.toLocaleLowerCase("en-US"),
        description: input.content.slice(0, 2_000),
        type: "activity",
        subject: "",
        subjectLower: "",
        gradeLevel: "",
        tags,
        accessTier: "free",
        downloadCount: 0,
        ratingTotal: 0,
        ratingAverage: 0,
        ratingCount: 0,
        status: "draft",
        moderationStatus: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
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
  const media = await preparePostMedia(uid, input, input.postId);
  await db.runTransaction(async (transaction) => {
    const [post, user] = await Promise.all([
      transaction.get(postRef),
      transaction.get(db.doc(`users/${uid}`)),
    ]);
    if (!post.exists) throw new FeedActionError("not-found");
    if (post.data()?.authorId !== uid) throw new FeedActionError("not-owner");
    if (!user.exists || user.data()?.status !== "active")
      throw new FeedActionError("inactive");
    const mentions =
      input.mentionUids === undefined
        ? mentionsFromData(post.data()?.mentions).filter((mention) =>
            input.content.includes(`@${mention.displayName}`),
          )
        : (await resolveMentions(transaction, input.mentionUids)).filter(
            (mention) => input.content.includes(`@${mention.displayName}`),
          );
    const recipients = await prepareCommunityNotifications(transaction, uid, [
      ...mentions.map((mention) => mention.uid),
    ]);
    const claimMedia = await readPostMediaClaims(
      transaction,
      uid,
      input.postId,
      media,
    );
    claimMedia();
    transaction.update(postRef, {
      mentions,
      type: input.type,
      content: input.content,
      imageURLs: media.imageURLs,
      fileAttachments: media.fileAttachments,
      linkURLs: input.linkURLs,
      tags: [...new Set(input.tags.map((tag) => tag.toLowerCase()))],
      resourceId: input.type === "resource" ? input.resourceId : null,
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const previousUids = new Set(
      mentionsFromData(post.data()?.mentions).map((mention) => mention.uid),
    );
    writeMentionNotifications(transaction, {
      recipients,
      mentions: mentions.filter((mention) => !previousUids.has(mention.uid)),
      actorId: uid,
      actorName: String(user.data()?.displayName ?? "An educator"),
      entityId: input.postId,
      entityKey: `post_${input.postId}`,
      context: "post",
      href: `/post/${input.postId}`,
    });
  });
}

async function assertVisiblePost(
  transaction: FirebaseFirestore.Transaction,
  postRef: FirebaseFirestore.DocumentReference,
) {
  const post = await transaction.get(postRef);
  if (!post.exists) throw new FeedActionError("not-found");
  if (!(await publicPostIds([post], transaction)).has(post.id))
    throw new FeedActionError("not-visible");
  return post;
}

function assertInteractivePost(post: FirebaseFirestore.DocumentSnapshot): void {
  if (post.data()?.type === "activity")
    throw new FeedActionError("not-interactive");
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
    assertInteractivePost(post);
    if (liked === like.exists) return;
    const recipients = await prepareCommunityNotifications(transaction, uid, [
      String(post.data()?.authorId ?? ""),
    ]);
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
        writeCommunityNotification(transaction, recipients, {
          recipientId: ownerId,
          id: `post-like_${postId}_${uid}`,
          type: "post-like",
          actorId: uid,
          actorName: String(actor.data()?.displayName ?? "An educator"),
          entityId: postId,
          message: `${String(actor.data()?.displayName ?? "An educator")} liked your post.`,
          href: `/post/${postId}`,
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
    assertInteractivePost(post);
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

export async function recordPostShare(
  uid: string,
  postId: string,
): Promise<boolean> {
  const db = adminDb();
  return db.runTransaction(async (transaction) => {
    const postRef = db.doc(`posts/${postId}`);
    const shareRef = db.doc(`postShares/${postId}_${uid}`);
    const [post, share] = await Promise.all([
      assertVisiblePost(transaction, postRef),
      transaction.get(shareRef),
    ]);
    assertInteractivePost(post);
    if (share.exists) return false;
    transaction.create(shareRef, {
      postId,
      uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(postRef, {
      shareCount: nonnegativeCount(post.data()?.shareCount) + 1,
    });
    return true;
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
    assertInteractivePost(post);
    if (!user.exists || user.data()?.status !== "active")
      throw new FeedActionError("inactive");
    const mentions = await resolveMentions(transaction, input.mentionUids);
    const actorName = String(user.data()?.displayName ?? "An educator");
    const recipients = await prepareCommunityNotifications(transaction, uid, [
      String(post.data()?.authorId ?? ""),
      ...mentions.map((mention) => mention.uid),
    ]);
    transaction.create(commentRef, {
      authorId: uid,
      content: input.content,
      mentions,
      moderationStatus: "approved",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeMentionNotifications(transaction, {
      recipients,
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
    if (
      ownerId &&
      ownerId !== uid &&
      !mentions.some((mention) => mention.uid === ownerId)
    ) {
      writeCommunityNotification(transaction, recipients, {
        recipientId: ownerId,
        id: `post-comment_${commentRef.id}`,
        type: "post-comment",
        actorId: uid,
        actorName,
        entityId: input.postId,
        message: `${actorName} commented on your post.`,
        href: `/post/${input.postId}#comment-${commentRef.id}`,
      });
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
  if (post.data()?.type === "activity") {
    if (!(await publicPostIds([post])).has(post.id))
      throw new FeedActionError("not-visible");
    return [];
  }
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
    const [post, comment, actor] = await Promise.all([
      assertVisiblePost(transaction, postRef),
      transaction.get(commentRef),
      transaction.get(db.doc(`users/${uid}`)),
    ]);
    if (!post.exists || !comment.exists) throw new FeedActionError("not-found");
    if (actor.data()?.status !== "active")
      throw new FeedActionError("inactive");
    if (comment.data()?.authorId !== uid)
      throw new FeedActionError("not-owner");
    const mentions =
      input.mentionUids === undefined
        ? mentionsFromData(comment.data()?.mentions).filter((mention) =>
            input.content.includes(`@${mention.displayName}`),
          )
        : (await resolveMentions(transaction, input.mentionUids)).filter(
            (mention) => input.content.includes(`@${mention.displayName}`),
          );
    const recipients = await prepareCommunityNotifications(transaction, uid, [
      ...mentions.map((mention) => mention.uid),
    ]);
    transaction.update(commentRef, {
      mentions,
      content: input.content,
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const previousUids = new Set(
      mentionsFromData(comment.data()?.mentions).map((mention) => mention.uid),
    );
    writeMentionNotifications(transaction, {
      recipients,
      mentions: mentions.filter((mention) => !previousUids.has(mention.uid)),
      actorId: uid,
      actorName: String(actor.data()?.displayName ?? "An educator"),
      entityId: input.postId,
      entityKey: `comment_${input.commentId}`,
      context: "comment",
      href: `/post/${input.postId}#comment-${input.commentId}`,
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
  try {
    await reportPublicContent(reporterId, "post", input.postId, input);
  } catch (error) {
    if (error instanceof ContentReportError)
      throw new FeedActionError(error.code);
    throw error;
  }
}

export async function deletePost(uid: string, postId: string): Promise<void> {
  const db = adminDb();
  const postRef = db.doc(`posts/${postId}`);
  await db.runTransaction(async (transaction) => {
    const resourceDraftRef = db.doc(`resources/post_${postId}`);
    const [post, resourceDraft] = await transaction.getAll(
      postRef,
      resourceDraftRef,
    );
    if (!post.exists) throw new FeedActionError("not-found");
    if (post.data()?.authorId !== uid) throw new FeedActionError("not-owner");
    transaction.delete(postRef);
    if (
      resourceDraft.exists &&
      resourceDraft.data()?.status === "draft" &&
      resourceDraft.data()?.completionStatus === "incomplete"
    )
      transaction.delete(resourceDraftRef);
    if (post.data()?.type !== "activity")
      transaction.update(db.doc(`users/${uid}`), {
        postCount: FieldValue.increment(-1),
      });
  });

  const [likes, bookmarks, shares, reports] = await Promise.all([
    db.collection("postLikes").where("postId", "==", postId).get(),
    db.collection("postBookmarks").where("postId", "==", postId).get(),
    db.collection("postShares").where("postId", "==", postId).get(),
    db.collection("reports").where("targetId", "==", postId).get(),
    db.recursiveDelete(postRef),
  ]);
  const writer = db.bulkWriter();
  for (const document of [
    ...likes.docs,
    ...bookmarks.docs,
    ...shares.docs,
    ...reports.docs,
  ])
    writer.delete(document.ref);
  await writer.close();
}
