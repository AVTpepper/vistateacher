import "server-only";

import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Query,
  type Transaction,
} from "firebase-admin/firestore";

import { adminDb, adminStorage } from "@/lib/firebase/admin";
import {
  decodeMessageCursor,
  encodeMessageCursor,
} from "@/lib/messages/cursor";
import { createConversationId } from "@/lib/messages/conversation-id";
import type {
  BlockUserInput,
  MessageQuery,
  MessageReportInput,
  ReserveMessageAttachmentInput,
  SendMessageInput,
  StartConversationInput,
} from "@/schemas/messages";

const CONVERSATION_LIMIT = 50;
const MESSAGE_PAGE_SIZE = 30;

export interface MessageParticipant {
  uid: string;
  displayName: string;
  photoURL: string | null;
  gradeLevel: string;
  school: string;
}

export interface ConversationSummary {
  id: string;
  participant: MessageParticipant;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  blockedByViewer: boolean;
  blockedViewer: boolean;
}

export interface MessageAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  attachment: MessageAttachment | null;
  readBy: string[];
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface MessagePage {
  messages: DirectMessage[];
  nextCursor: string | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  actorId: string | null;
  actorName: string | null;
  entityId: string | null;
  message: string;
  href: string;
  read: boolean;
  archived: boolean;
  createdAt: string;
}

export interface NotificationPage {
  notifications: NotificationItem[];
  nextCursor: string | null;
}

export class MessageActionError extends Error {
  constructor(
    public readonly code:
      | "inactive"
      | "not-found"
      | "not-member"
      | "self-message"
      | "blocked"
      | "limit-reached"
      | "invalid-cursor"
      | "invalid-attachment"
        | "not-owner"
      | "already-reported",
  ) {
    super(code);
  }
}

function number(value: unknown): number {
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

function participant(uid: string, data: DocumentData | undefined) {
  return {
    uid,
    displayName: String(data?.displayName ?? "Educator"),
    photoURL: typeof data?.photoURL === "string" ? data.photoURL : null,
    gradeLevel: String(data?.gradeLevel ?? "Educator"),
    school: String(data?.school ?? ""),
  } satisfies MessageParticipant;
}

function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function messageLimit(subscription: DocumentData | undefined, now: Date) {
  const end = (value: unknown) =>
    value instanceof Timestamp ? value.toDate() : null;
  const paid =
    subscription?.plan === "plus" &&
    (subscription.status === "active" || subscription.status === "trialing") &&
    (!end(subscription.currentPeriodEnd) ||
      end(subscription.currentPeriodEnd)! > now);
  const trial =
    subscription?.trialConsumed === true &&
    end(subscription.trialEndsAt) !== null &&
    end(subscription.trialEndsAt)! > now;
  return paid || trial ? null : 10;
}

function blockId(blockerUid: string, blockedUid: string): string {
  return `${blockerUid}_${blockedUid}`;
}

function preview(content: string, hasAttachment: boolean): string {
  if (content) return content.slice(0, 180);
  return hasAttachment ? "Shared an attachment" : "New message";
}

function attachmentFrom(data: DocumentData): MessageAttachment {
  return {
    id: String(data.id),
    fileName: String(data.fileName),
    fileType: String(data.fileType),
    fileSize: number(data.fileSize),
  };
}

function messageFrom(
  conversationId: string,
  id: string,
  data: DocumentData,
): DirectMessage {
  return {
    id,
    conversationId,
    senderId: String(data.senderId),
    content: String(data.content ?? ""),
    attachment:
      data.attachment && typeof data.attachment === "object"
        ? attachmentFrom(data.attachment as DocumentData)
        : null,
    readBy: strings(data.readBy),
    createdAt: timestamp(data.createdAt).toDate().toISOString(),
    updatedAt: timestamp(data.updatedAt).toDate().toISOString(),
    editedAt:
      data.editedAt instanceof Timestamp
        ? data.editedAt.toDate().toISOString()
        : null,
    deletedAt:
      data.deletedAt instanceof Timestamp
        ? data.deletedAt.toDate().toISOString()
        : null,
  };
}

async function requireActiveUser(
  transaction: Transaction,
  reference: DocumentReference,
) {
  const snapshot = await transaction.get(reference);
  if (!snapshot.exists) throw new MessageActionError("not-found");
  const status = snapshot.data()?.status;
  if (status && status !== "active")
    throw new MessageActionError("inactive");
  return snapshot;
}

export async function getConversationSummaries(
  uid: string,
): Promise<ConversationSummary[]> {
  const db = adminDb();
  const snapshot = await db
    .collection("conversations")
    .where("participantIds", "array-contains", uid)
    .orderBy("lastMessageAt", "desc")
    .limit(CONVERSATION_LIMIT)
    .get();
  const otherIds = snapshot.docs.map(
    (document) =>
      strings(document.data().participantIds).find((id) => id !== uid) ?? "",
  );
  const uniqueOtherIds = [...new Set(otherIds.filter(Boolean))];
  const [users, outgoingBlocks, incomingBlocks] = await Promise.all([
    Promise.all(uniqueOtherIds.map((id) => db.doc(`users/${id}`).get())),
    Promise.all(
      uniqueOtherIds.map((id) => db.doc(`blocks/${blockId(uid, id)}`).get()),
    ),
    Promise.all(
      uniqueOtherIds.map((id) => db.doc(`blocks/${blockId(id, uid)}`).get()),
    ),
  ]);
  const userMap = new Map(users.map((item) => [item.id, item.data()]));
  const outgoing = new Set(
    outgoingBlocks
      .filter((item) => item.exists)
      .map((item) => item.data()?.blockedUid),
  );
  const incoming = new Set(
    incomingBlocks
      .filter((item) => item.exists)
      .map((item) => item.data()?.blockerUid),
  );
  return snapshot.docs.map((document, index) => {
    const data = document.data();
    const otherId = otherIds[index];
    const unreadCounts =
      data.unreadCounts && typeof data.unreadCounts === "object"
        ? (data.unreadCounts as Record<string, unknown>)
        : {};
    return {
      id: document.id,
      participant: participant(otherId, userMap.get(otherId)),
      lastMessagePreview: String(data.lastMessagePreview ?? ""),
      lastMessageAt: timestamp(data.lastMessageAt).toDate().toISOString(),
      unreadCount: number(unreadCounts[uid]),
      blockedByViewer: outgoing.has(otherId),
      blockedViewer: incoming.has(otherId),
    };
  });
}

export async function getMessagePage(
  uid: string,
  input: MessageQuery,
): Promise<MessagePage> {
  const db = adminDb();
  const conversation = await db
    .doc(`conversations/${input.conversationId}`)
    .get();
  if (!conversation.exists) throw new MessageActionError("not-found");
  if (!strings(conversation.data()?.participantIds).includes(uid))
    throw new MessageActionError("not-member");
  let query: Query = conversation.ref
    .collection("messages")
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (input.cursor) {
    const cursor = decodeMessageCursor(input.cursor);
    if (!cursor) throw new MessageActionError("invalid-cursor");
    query = query.startAfter(Timestamp.fromMillis(cursor.createdAt), cursor.id);
  }
  const snapshot = await query.limit(MESSAGE_PAGE_SIZE + 1).get();
  const documents = snapshot.docs.slice(0, MESSAGE_PAGE_SIZE);
  const last = documents.at(-1);
  return {
    messages: documents
      .map((document) =>
        messageFrom(input.conversationId, document.id, document.data()),
      )
      .reverse(),
    nextCursor:
      snapshot.size > MESSAGE_PAGE_SIZE && last
        ? encodeMessageCursor({
            createdAt: timestamp(last.data().createdAt).toMillis(),
            id: last.id,
          })
        : null,
  };
}

async function verifiedAttachment(
  uid: string,
  conversationId: string,
  attachmentId: string | null,
) {
  if (!attachmentId) return null;
  const document = await adminDb()
    .doc(`messageAttachments/${attachmentId}`)
    .get();
  const data = document.data();
  if (
    !document.exists ||
    data?.ownerId !== uid ||
    data.conversationId !== conversationId ||
    data.status !== "reserved"
  )
    throw new MessageActionError("invalid-attachment");
  const [metadata] = await adminStorage()
    .bucket()
    .file(String(data.path))
    .getMetadata();
  if (
    metadata.contentType !== data.fileType ||
    Number(metadata.size) !== data.fileSize
  )
    throw new MessageActionError("invalid-attachment");
  return document;
}

async function writeMessage(
  uid: string,
  conversationId: string,
  content: string,
  attachmentId: string | null,
  requestedRecipientId: string | null,
) {
  const db = adminDb();
  const conversationRef = db.doc(`conversations/${conversationId}`);
  const messageRef = conversationRef.collection("messages").doc();
  const attachment = await verifiedAttachment(
    uid,
    conversationId,
    attachmentId,
  );
  const now = new Date();
  const usageRef = db.doc(`usage/${uid}_${dayKey(now)}`);
  await db.runTransaction(async (transaction) => {
    const conversation = await transaction.get(conversationRef);
    const existingParticipants = strings(conversation.data()?.participantIds);
    const recipientId =
      existingParticipants.find((id) => id !== uid) ?? requestedRecipientId;
    if (!recipientId) throw new MessageActionError("not-member");
    if (recipientId === uid) throw new MessageActionError("self-message");
    const expectedId = createConversationId(uid, recipientId);
    if (expectedId !== conversationId)
      throw new MessageActionError("not-member");
    if (
      conversation.exists &&
      (!existingParticipants.includes(uid) ||
        !existingParticipants.includes(recipientId))
    )
      throw new MessageActionError("not-member");
    const senderRef = db.doc(`users/${uid}`);
    const recipientRef = db.doc(`users/${recipientId}`);
    const [
      sender,
      ,
      outgoingBlock,
      incomingBlock,
      usage,
      subscription,
      reserved,
    ] = await Promise.all([
      requireActiveUser(transaction, senderRef),
      requireActiveUser(transaction, recipientRef),
      transaction.get(db.doc(`blocks/${blockId(uid, recipientId)}`)),
      transaction.get(db.doc(`blocks/${blockId(recipientId, uid)}`)),
      transaction.get(usageRef),
      transaction.get(db.doc(`subscriptions/${uid}`)),
      attachment ? transaction.get(attachment.ref) : Promise.resolve(null),
    ]);
    if (outgoingBlock.exists || incomingBlock.exists)
      throw new MessageActionError("blocked");
    const limit = messageLimit(subscription.data(), now);
    const used = number(usage.data()?.messages);
    if (limit !== null && used >= limit)
      throw new MessageActionError("limit-reached");
    if (attachment && reserved?.data()?.status !== "reserved")
      throw new MessageActionError("invalid-attachment");
    const attachmentData = attachment
      ? {
          id: attachment.id,
          fileName: String(attachment.data()?.fileName),
          fileType: String(attachment.data()?.fileType),
          fileSize: number(attachment.data()?.fileSize),
          path: String(attachment.data()?.path),
        }
      : null;
    transaction.set(messageRef, {
      senderId: uid,
      content,
      attachment: attachmentData,
      readBy: [uid],
      moderationStatus: "approved",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      editedAt: null,
      deletedAt: null,
    });
    transaction.set(
      conversationRef,
      {
        participantIds: [uid, recipientId].sort(),
        lastMessagePreview: preview(content, Boolean(attachmentData)),
        lastMessageAt: FieldValue.serverTimestamp(),
        lastSenderId: uid,
        unreadCounts: {
          ...((conversation.data()?.unreadCounts as
            Record<string, unknown> | undefined) ?? {}),
          [uid]: 0,
          [recipientId]:
            number(conversation.data()?.unreadCounts?.[recipientId]) + 1,
        },
        createdAt: conversation.exists
          ? conversation.data()?.createdAt
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.set(
      usageRef,
      {
        uid,
        period: dayKey(now),
        messages: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.create(
      db.doc(`users/${recipientId}/notifications/message_${messageRef.id}`),
      {
        type: "message",
        actorId: uid,
        actorName: String(sender.data()?.displayName ?? "An educator"),
        entityId: conversationId,
        message: `${String(sender.data()?.displayName ?? "An educator")} sent you a message.`,
        href: `/messages?conversation=${conversationId}`,
        read: false,
        archived: false,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
    if (attachment) transaction.update(attachment.ref, { status: "consumed" });
  });
  return { conversationId, messageId: messageRef.id };
}

export async function editMessage(
  uid: string,
  conversationId: string,
  messageId: string,
  content: string,
): Promise<void> {
  const db = adminDb();
  const conversationRef = db.doc(`conversations/${conversationId}`);
  const messageRef = conversationRef.collection("messages").doc(messageId);
  await db.runTransaction(async (transaction) => {
    const [conversation, message, user] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(messageRef),
      transaction.get(db.doc(`users/${uid}`)),
    ]);
    if (!conversation.exists || !message.exists)
      throw new MessageActionError("not-found");
    if (!strings(conversation.data()?.participantIds).includes(uid))
      throw new MessageActionError("not-member");
    if (message.data()?.senderId !== uid) throw new MessageActionError("not-owner");
    if (user.data()?.status !== "active") throw new MessageActionError("inactive");
    if (message.data()?.deletedAt instanceof Timestamp)
      throw new MessageActionError("not-found");
    transaction.update(messageRef, {
      content,
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (
      timestamp(conversation.data()?.lastMessageAt).toMillis() ===
      timestamp(message.data()?.createdAt).toMillis()
    ) {
      transaction.update(conversationRef, {
        lastMessagePreview: preview(content, Boolean(message.data()?.attachment)),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

export async function deleteMessage(
  uid: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  const db = adminDb();
  const conversationRef = db.doc(`conversations/${conversationId}`);
  const messageRef = conversationRef.collection("messages").doc(messageId);
  await db.runTransaction(async (transaction) => {
    const [conversation, message, user] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(messageRef),
      transaction.get(db.doc(`users/${uid}`)),
    ]);
    if (!conversation.exists || !message.exists)
      throw new MessageActionError("not-found");
    if (!strings(conversation.data()?.participantIds).includes(uid))
      throw new MessageActionError("not-member");
    if (message.data()?.senderId !== uid) throw new MessageActionError("not-owner");
    if (user.data()?.status !== "active") throw new MessageActionError("inactive");
    const deletedContent = "This message was deleted.";
    transaction.update(messageRef, {
      content: deletedContent,
      attachment: null,
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (
      timestamp(conversation.data()?.lastMessageAt).toMillis() ===
      timestamp(message.data()?.createdAt).toMillis()
    ) {
      transaction.update(conversationRef, {
        lastMessagePreview: deletedContent,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

export async function startConversation(
  uid: string,
  input: StartConversationInput,
) {
  if (uid === input.recipientId) throw new MessageActionError("self-message");
  const conversationId = createConversationId(uid, input.recipientId);
  return writeMessage(
    uid,
    conversationId,
    input.content,
    null,
    input.recipientId,
  );
}

export async function sendMessage(uid: string, input: SendMessageInput) {
  return writeMessage(
    uid,
    input.conversationId,
    input.content,
    input.attachmentId,
    null,
  );
}

export async function reserveMessageAttachment(
  uid: string,
  input: ReserveMessageAttachmentInput,
) {
  const db = adminDb();
  const conversation = await db
    .doc(`conversations/${input.conversationId}`)
    .get();
  if (!conversation.exists) throw new MessageActionError("not-found");
  if (!strings(conversation.data()?.participantIds).includes(uid))
    throw new MessageActionError("not-member");
  const reference = db.collection("messageAttachments").doc();
  const extension = input.attachment.fileName.split(".").at(-1)?.toLowerCase();
  const safeExtension =
    extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : "bin";
  const path = `messages/${input.conversationId}/${reference.id}/attachment.${safeExtension}`;
  await reference.create({
    ownerId: uid,
    conversationId: input.conversationId,
    ...input.attachment,
    path,
    status: "reserved",
    createdAt: FieldValue.serverTimestamp(),
  });
  return { attachmentId: reference.id, uploadPath: path };
}

export async function getMessageAttachment(
  uid: string,
  conversationId: string,
  attachmentId: string,
) {
  const db = adminDb();
  const [conversation, attachment] = await Promise.all([
    db.doc(`conversations/${conversationId}`).get(),
    db.doc(`messageAttachments/${attachmentId}`).get(),
  ]);
  const data = attachment.data();
  if (!conversation.exists || !attachment.exists)
    throw new MessageActionError("not-found");
  if (!strings(conversation.data()?.participantIds).includes(uid))
    throw new MessageActionError("not-member");
  if (data?.conversationId !== conversationId || data.status !== "consumed")
    throw new MessageActionError("not-found");
  const [body] = await adminStorage()
    .bucket()
    .file(String(data.path))
    .download();
  return {
    body,
    fileName: String(data.fileName),
    fileType: String(data.fileType),
  };
}

export async function cancelMessageAttachment(
  uid: string,
  conversationId: string,
  attachmentId: string,
) {
  const db = adminDb();
  const reference = db.doc(`messageAttachments/${attachmentId}`);
  const attachment = await reference.get();
  const data = attachment.data();
  if (!attachment.exists) return;
  if (
    data?.ownerId !== uid ||
    data.conversationId !== conversationId ||
    data.status !== "reserved"
  )
    throw new MessageActionError("invalid-attachment");
  await Promise.all([
    adminStorage()
      .bucket()
      .file(String(data.path))
      .delete({ ignoreNotFound: true }),
    reference.delete(),
  ]);
}

export async function markConversationRead(
  uid: string,
  conversationId: string,
) {
  const db = adminDb();
  const reference = db.doc(`conversations/${conversationId}`);
  const conversation = await reference.get();
  if (!conversation.exists) throw new MessageActionError("not-found");
  if (!strings(conversation.data()?.participantIds).includes(uid))
    throw new MessageActionError("not-member");
  const recentMessages = await reference
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  const batch = db.batch();
  batch.update(reference, { [`unreadCounts.${uid}`]: 0 });
  for (const document of recentMessages.docs)
    if (!strings(document.data().readBy).includes(uid))
      batch.update(document.ref, { readBy: FieldValue.arrayUnion(uid) });
  await batch.commit();
}

export async function setUserBlocked(uid: string, input: BlockUserInput) {
  if (uid === input.blockedUid) throw new MessageActionError("self-message");
  const db = adminDb();
  const reference = db.doc(`blocks/${blockId(uid, input.blockedUid)}`);
  if (!input.blocked) return reference.delete();
  const [blocker, blocked] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`users/${input.blockedUid}`).get(),
  ]);
  if (!blocker.exists || !blocked.exists)
    throw new MessageActionError("not-found");
  if (blocker.data()?.status !== "active")
    throw new MessageActionError("inactive");
  await reference.set({
    blockerUid: uid,
    blockedUid: input.blockedUid,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function reportMessage(uid: string, input: MessageReportInput) {
  const db = adminDb();
  const conversation = await db
    .doc(`conversations/${input.conversationId}`)
    .get();
  if (!conversation.exists) throw new MessageActionError("not-found");
  if (!strings(conversation.data()?.participantIds).includes(uid))
    throw new MessageActionError("not-member");
  const message = await conversation.ref
    .collection("messages")
    .doc(input.messageId)
    .get();
  if (!message.exists) throw new MessageActionError("not-found");
  const reference = db.doc(`reports/message_${input.messageId}_${uid}`);
  try {
    await reference.create({
      reporterId: uid,
      targetType: "message",
      targetId: input.messageId,
      parentId: input.conversationId,
      reason: input.reason,
      details: input.details,
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if ((error as { code?: number | string }).code === 6)
      throw new MessageActionError("already-reported");
    throw error;
  }
}

export async function getNotifications(
  uid: string,
  cursorValue?: string,
): Promise<NotificationPage> {
  const db = adminDb();
  let query: Query = db
    .collection(`users/${uid}/notifications`)
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (cursorValue) {
    const cursor = decodeMessageCursor(cursorValue);
    if (!cursor) throw new MessageActionError("invalid-cursor");
    query = query.startAfter(Timestamp.fromMillis(cursor.createdAt), cursor.id);
  }
  const snapshot = await query.limit(MESSAGE_PAGE_SIZE + 1).get();
  const documents = snapshot.docs.slice(0, MESSAGE_PAGE_SIZE);
  const last = documents.at(-1);
  return {
    notifications: documents.map((document) => {
      const data = document.data();
      return {
        id: document.id,
        type: String(data.type ?? "update"),
        actorId: typeof data.actorId === "string" ? data.actorId : null,
        actorName: typeof data.actorName === "string" ? data.actorName : null,
        entityId: typeof data.entityId === "string" ? data.entityId : null,
        message: String(data.message ?? "You have a new update."),
        href: String(data.href ?? "/app"),
        read: data.read === true,
        archived: data.archived === true,
        createdAt: timestamp(data.createdAt).toDate().toISOString(),
      };
    }),
    nextCursor:
      snapshot.size > MESSAGE_PAGE_SIZE && last
        ? encodeMessageCursor({
            createdAt: timestamp(last.data().createdAt).toMillis(),
            id: last.id,
          })
        : null,
  };
}

export type NotificationAction =
  | "mark-read"
  | "mark-unread"
  | "archive"
  | "restore"
  | "delete";

export async function updateNotification(
  uid: string,
  notificationId: string | null,
  action: NotificationAction,
) {
  const db = adminDb();
  if (notificationId) {
    const reference = db.doc(`users/${uid}/notifications/${notificationId}`);
    if (!(await reference.get()).exists)
      throw new MessageActionError("not-found");
    if (action === "delete") {
      await reference.delete();
      return;
    }
    const updates = {
      "mark-read": { read: true },
      "mark-unread": { read: false },
      archive: { archived: true },
      restore: { archived: false },
    } as const;
    await reference.update(updates[action]);
    return;
  }
  const unread = await db
    .collection(`users/${uid}/notifications`)
    .where("read", "==", false)
    .limit(100)
    .get();
  const batch = db.batch();
  for (const document of unread.docs)
    batch.update(document.ref, { read: true });
  await batch.commit();
}
