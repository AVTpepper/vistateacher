import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import type { MentionTarget } from "@/lib/mentions/types";
import { writeCommunityNotification } from "@/lib/notifications/delivery";

export async function resolveMentions(
  transaction: FirebaseFirestore.Transaction,
  mentionUids: string[] | undefined,
): Promise<MentionTarget[]> {
  const db = adminDb();
  const uids = [...new Set(mentionUids ?? [])].slice(0, 10);
  if (!uids.length) return [];
  const users = await Promise.all(
    uids.map((uid) => transaction.get(db.doc(`users/${uid}`))),
  );
  return users.flatMap((user) => {
    const displayName = String(user.data()?.displayName ?? "").trim();
    return user.exists && user.data()?.status === "active" && displayName
      ? [{ uid: user.id, displayName }]
      : [];
  });
}

export function mentionsFromData(value: unknown): MentionTarget[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const uid = "uid" in item ? String(item.uid ?? "").trim() : "";
    const displayName =
      "displayName" in item ? String(item.displayName ?? "").trim() : "";
    return uid && displayName ? [{ uid, displayName }] : [];
  });
}

export function writeMentionNotifications(
  transaction: FirebaseFirestore.Transaction,
  input: {
    mentions: MentionTarget[];
    actorId: string;
    actorName: string;
    entityId: string;
    entityKey: string;
    context: "post" | "comment" | "forum discussion" | "forum comment";
    href: string;
    recipients: ReadonlySet<string>;
  },
): void {
  for (const mention of input.mentions) {
    writeCommunityNotification(transaction, input.recipients, {
      recipientId: mention.uid,
      id: `mention_${input.entityKey}_${input.actorId}`,
      type: "mention",
      actorId: input.actorId,
      actorName: input.actorName,
      entityId: input.entityId,
      message: `${input.actorName} mentioned you in a ${input.context}.`,
      href: input.href,
    });
  }
}
