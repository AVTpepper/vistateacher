import type { NotificationItem } from "@/lib/messages/server";

export interface NotificationGroup {
  key: string;
  ids: string[];
  type: string;
  message: string;
  href: string;
  read: boolean;
  archived: boolean;
  createdAt: string;
}

export function groupNotifications(
  notifications: NotificationItem[],
): NotificationGroup[] {
  const groups = new Map<string, NotificationItem[]>();
  for (const notification of notifications) {
    const key = groupKey(notification);
    groups.set(key, [...(groups.get(key) ?? []), notification]);
  }

  return [...groups.entries()].map(([key, items]) => {
    const latest = items[0]!;
    return {
      key,
      ids: items.map((item) => item.id),
      type: latest.type,
      message: groupMessage(items),
      href: latest.href,
      read: items.every((item) => item.read),
      archived: items.every((item) => item.archived),
      createdAt: latest.createdAt,
    };
  });
}

function groupKey(notification: NotificationItem): string {
  if (notification.type === "message") {
    return [
      notification.type,
      notification.actorId ?? notification.actorName ?? "unknown",
      notification.entityId ?? notification.href,
    ].join(":");
  }
  if (
    notification.entityId &&
    [
      "post-like",
      "post-comment",
      "forum-like",
      "forum-reply",
      "resource-download",
      "mention",
    ].includes(notification.type)
  ) {
    return `${notification.type}:${notification.entityId}`;
  }
  return notification.id;
}

function groupMessage(items: NotificationItem[]): string {
  const latest = items[0]!;
  if (items.length === 1) return latest.message;

  const names = [
    ...new Set(
      items.flatMap((item) => (item.actorName ? [item.actorName] : [])),
    ),
  ];
  const unreadCount = items.filter((item) => !item.read).length;

  if (latest.type === "message") {
    const actor = latest.actorName ?? "An educator";
    const count = unreadCount || items.length;
    return unreadCount
      ? `${actor} has sent you ${count} new ${count === 1 ? "message" : "messages"}.`
      : `${actor} sent you ${items.length} messages.`;
  }

  if (!names.length) return latest.message;
  const actors = formatActorNames(names, names.length);
  const count = unreadCount || items.length;
  const newLabel = unreadCount ? " new" : "";
  if (latest.type === "post-like") return `${actors} liked your post.`;
  if (latest.type === "post-comment")
    return `${actors} left ${count}${newLabel} ${count === 1 ? "comment" : "comments"} on your post.`;
  if (latest.type === "forum-like")
    return `${actors} liked your forum discussion.`;
  if (latest.type === "forum-reply")
    return `${actors} left ${count}${newLabel} ${count === 1 ? "reply" : "replies"} in your forum discussion.`;
  if (latest.type === "resource-download")
    return `${actors} downloaded your resource ${count} ${count === 1 ? "time" : "times"}.`;
  if (latest.type === "mention")
    return `${actors} mentioned you ${count} ${count === 1 ? "time" : "times"}.`;
  return latest.message;
}

function formatActorNames(names: string[], total: number): string {
  if (total === 1) return names[0]!;
  if (total === 2 && names.length >= 2) return `${names[0]} and ${names[1]}`;
  const visibleNames = names.slice(0, 3);
  const remaining = total - visibleNames.length;
  if (remaining > 0)
    return `${visibleNames.join(", ")}, and ${remaining} ${remaining === 1 ? "other" : "others"}`;
  return `${visibleNames.slice(0, -1).join(", ")}, and ${visibleNames.at(-1)}`;
}
