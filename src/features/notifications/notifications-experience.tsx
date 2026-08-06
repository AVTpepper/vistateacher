"use client";

import { Bell, CheckCheck, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import type { NotificationItem, NotificationPage } from "@/lib/messages/server";

export function NotificationsExperience({
  initialPage,
}: {
  initialPage: NotificationPage;
}) {
  const [page, setPage] = useState(initialPage);
  const [pending, setPending] = useState(false);
  const unread = page.notifications.filter((item) => !item.read).length;

  async function markRead(notificationId: string | null) {
    setPending(true);
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId }),
    });
    setPending(false);
    if (!response.ok) return toast.error("We couldn't update notifications.");
    setPage((current) => ({
      ...current,
      notifications: current.notifications.map((item) =>
        !notificationId || item.id === notificationId
          ? { ...item, read: true }
          : item,
      ),
    }));
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
              onClick={() => void markRead(null)}
              className="text-primary hover:bg-muted flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold disabled:opacity-50"
            >
              <CheckCheck aria-hidden="true" className="size-4" />
              Mark all read
            </button>
          )}
        </header>

        {page.notifications.length ? (
          <div className="bg-card overflow-hidden rounded-xl border">
            {page.notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onRead={() => void markRead(notification.id)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl border py-16 text-center">
            <Bell
              aria-hidden="true"
              className="text-muted-foreground/30 mx-auto size-9"
            />
            <h2 className="mt-3 font-serif text-xl">
              You&apos;re all caught up
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              New community updates will appear here.
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
  onRead,
}: {
  notification: NotificationItem;
  onRead: () => void;
}) {
  return (
    <Link
      href={notification.href}
      onClick={() => {
        if (!notification.read) onRead();
      }}
      className={`hover:bg-muted/50 flex gap-3 border-b p-4 last:border-b-0 ${
        notification.read ? "" : "bg-secondary/20"
      }`}
    >
      <span className="bg-secondary text-primary grid size-10 shrink-0 place-items-center rounded-full">
        {notification.type === "message" ? (
          <MessageSquare aria-hidden="true" className="size-4" />
        ) : (
          <Bell aria-hidden="true" className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm ${notification.read ? "" : "font-bold"}`}
        >
          {notification.message}
        </span>
        <span className="text-muted-foreground mt-1 block text-xs">
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
          })}
        </span>
      </span>
      {!notification.read && (
        <span className="bg-primary mt-2 size-2 shrink-0 rounded-full" />
      )}
    </Link>
  );
}
