import "server-only";

import { FieldValue, type Transaction } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";

type CommunityNotificationType =
  | "follow"
  | "accept"
  | "message"
  | "mention"
  | "post-like"
  | "post-comment"
  | "forum-like"
  | "forum-reply"
  | "resource-download";

/** Call during the transaction's read phase, before any domain writes. */
export async function prepareCommunityNotifications(
  transaction: Transaction,
  actorId: string,
  recipientIds: string[],
): Promise<ReadonlySet<string>> {
  const db = adminDb();
  const recipients = [...new Set(recipientIds)].filter(
    (uid) => uid && uid !== actorId,
  );
  const eligible = await Promise.all(
    recipients.map(async (uid) => {
      const [user, settings, outgoingBlock, incomingBlock] =
        await transaction.getAll(
          db.doc(`users/${uid}`),
          db.doc(`userPrivate/${uid}`),
          db.doc(`blocks/${actorId}_${uid}`),
          db.doc(`blocks/${uid}_${actorId}`),
        );
      const inApp = settings.data()?.notificationSettings?.inApp;
      return user.data()?.status === "active" &&
        (inApp === undefined || inApp === true) &&
        !outgoingBlock.exists &&
        !incomingBlock.exists
        ? uid
        : null;
    }),
  );
  return new Set(eligible.filter((uid): uid is string => uid !== null));
}

/** Essential billing notifications deliberately use their own fixed policy. */
export function writeCommunityNotification(
  transaction: Transaction,
  recipients: ReadonlySet<string>,
  input: {
    recipientId: string;
    id: string;
    type: CommunityNotificationType;
    actorId: string;
    actorName: string;
    entityId: string;
    message: string;
    href: string;
  },
): void {
  if (!recipients.has(input.recipientId) || input.recipientId === input.actorId)
    return;
  const { recipientId, id, ...event } = input;
  transaction.set(adminDb().doc(`users/${recipientId}/notifications/${id}`), {
    ...event,
    read: false,
    archived: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}
