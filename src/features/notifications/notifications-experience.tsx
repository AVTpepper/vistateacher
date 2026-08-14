"use client";

import {
  Archive,
  ArchiveRestore,
  AtSign,
  Bell,
  Check,
  CheckCheck,
  Download,
  Heart,
  MessageSquare,
  Trash2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import type { NotificationItem, NotificationPage } from "@/lib/messages/server";
import { cn } from "@/lib/utils";

type NotificationFilter = "all" | "unread" | "archived";
type NotificationAction =
  "mark-read" | "mark-unread" | "archive" | "restore" | "delete";

export function NotificationsExperience({
  initialPage,
}: {
  initialPage: NotificationPage;
}) {
  const [page, setPage] = useState(initialPage);
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const unread = page.notifications.filter(
    (item) => !item.read && !item.archived,
  ).length;
  const visibleNotifications = page.notifications.filter((item) => {
    if (filter === "archived") return item.archived;
    if (filter === "unread") return !item.archived && !item.read;
    return !item.archived;
  });

  async function updateNotification(
    notificationId: string | null,
    action: NotificationAction,
  ) {
    if (notificationId) setPendingId(notificationId);
    else setPending(true);
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId, action }),
    });
    if (notificationId) setPendingId(null);
    else setPending(false);
    if (!response.ok) {
      toast.error("We couldn't update notifications.");
      return false;
    }
    setPage((current) => ({
      ...current,
      notifications:
        action === "delete"
          ? current.notifications.filter((item) => item.id !== notificationId)
          : current.notifications.map((item) => {
              if (notificationId && item.id !== notificationId) return item;
              if (action === "mark-read") return { ...item, read: true };
              if (action === "mark-unread") return { ...item, read: false };
              if (action === "archive") return { ...item, archived: true };
              if (action === "restore") return { ...item, archived: false };
              return item;
            }),
    }));
    return true;
  }

  async function loadMore() {
    if (!page.nextCursor || pending) return;
    setPending(true);
    const response = await fetch(
      `/api/notifications?cursor=${encodeURIComponent(page.nextCursor)}`,
    );
    const result = (await response
      .json()
      .catch(() => null)) as NotificationPage | null;
    setPending(false);
    if (!response.ok || !result)
      return toast.error("We couldn't load more notifications.");
    setPage((current) => ({
      notifications: [...current.notifications, ...result.notifications],
      nextCursor: result.nextCursor,
    }));
  }

  return (
    <div className="px-4 py-5 lg:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
          <div>
            <h1 className="font-serif text-3xl">Notifications</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Updates from your educator community.
            </p>
          </div>
          {unread > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void updateNotification(null, "mark-read")}
              className="text-primary hover:bg-muted flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold disabled:opacity-50"
            >
              <CheckCheck aria-hidden="true" className="size-4" />
              Mark all read
            </button>
          )}
        </header>

        <div
          aria-label="Notification filters"
          className="bg-muted mb-4 flex w-full gap-1 rounded-lg p-1 sm:w-fit"
        >
          {(["all", "unread", "archived"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "min-h-11 flex-1 rounded-md px-4 text-sm font-semibold capitalize sm:flex-none",
                filter === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>

        {visibleNotifications.length ? (
          <div className="surface-card overflow-hidden">
            {visibleNotifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                pending={pendingId === notification.id}
                onAction={(action) =>
                  void updateNotification(notification.id, action)
                }
              />
            ))}
          </div>
        ) : (
          <div className="surface-card py-16 text-center">
            <Bell
              aria-hidden="true"
              className="text-muted-foreground/30 mx-auto size-9"
            />
            <h2 className="mt-3 font-serif text-xl">
              {filter === "archived"
                ? "No archived updates"
                : "You're all caught up"}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {filter === "archived"
                ? "Notifications you archive will appear here."
                : "New community updates will appear here."}
            </p>
          </div>
        )}
        {page.nextCursor && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void loadMore()}
            className="bg-card hover:bg-muted mx-auto mt-5 block min-h-11 rounded-lg border px-5 text-sm font-bold disabled:opacity-50"
          >
            {pending ? "Loading..." : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}

function NotificationRow({
  notification,
  pending,
  onAction,
}: {
  notification: NotificationItem;
  pending: boolean;
  onAction: (action: NotificationAction) => void;
}) {
  return (
    <article
      className={cn(
        "flex gap-3 border-b p-4 last:border-b-0",
        !notification.read && "bg-secondary/20",
      )}
    >
      <span className="bg-secondary text-primary grid size-10 shrink-0 place-items-center rounded-full">
        <NotificationIcon type={notification.type} />
      </span>
      <span className="min-w-0 flex-1">
        <Link
          href={notification.href}
          onClick={() => {
            if (!notification.read) onAction("mark-read");
          }}
          className={cn(
            "hover:text-primary block text-sm",
            !notification.read && "font-bold",
          )}
        >
          {notification.message}
        </Link>
        <span className="text-muted-foreground mt-1 block text-xs">
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
          })}
        </span>
        <span className="mt-2 flex flex-wrap gap-1">
          <NotificationActionButton
            label={notification.read ? "Mark as unread" : "Mark as read"}
            disabled={pending}
            onClick={() =>
              onAction(notification.read ? "mark-unread" : "mark-read")
            }
          >
            <Check aria-hidden="true" className="size-3.5" />
          </NotificationActionButton>
          <NotificationActionButton
            label={notification.archived ? "Restore" : "Archive"}
            disabled={pending}
            onClick={() =>
              onAction(notification.archived ? "restore" : "archive")
            }
          >
            {notification.archived ? (
              <ArchiveRestore aria-hidden="true" className="size-3.5" />
            ) : (
              <Archive aria-hidden="true" className="size-3.5" />
            )}
          </NotificationActionButton>
          <NotificationActionButton
            label="Delete"
            disabled={pending}
            onClick={() => onAction("delete")}
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
          </NotificationActionButton>
        </span>
      </span>
      {!notification.read && (
        <span className="bg-primary mt-2 size-2 shrink-0 rounded-full" />
      )}
    </article>
  );
}

function NotificationActionButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-muted-foreground hover:bg-muted hover:text-foreground flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold disabled:opacity-50"
    >
      {children}
      {label}
    </button>
  );
}

function NotificationIcon({ type }: { type: string }) {
  const className = "size-4";
  if (type === "message" || type === "post-comment" || type === "forum-reply")
    return <MessageSquare aria-hidden="true" className={className} />;
  if (type === "follow")
    return <UserPlus aria-hidden="true" className={className} />;
  if (type === "post-like" || type === "forum-like")
    return <Heart aria-hidden="true" className={className} />;
  if (type === "resource-download")
    return <Download aria-hidden="true" className={className} />;
  if (type === "mention")
    return <AtSign aria-hidden="true" className={className} />;
  return <Bell aria-hidden="true" className={className} />;
}
