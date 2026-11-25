"use client";

import {
  Archive,
  ArchiveRestore,
  AtSign,
  Bell,
  CheckCheck,
  Download,
  Heart,
  Mail,
  MessageSquare,
  Trash2,
  UserPlus,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import {
  groupNotifications,
  type NotificationGroup,
} from "@/features/notifications/notification-groups";
import type {
  NotificationAction,
  NotificationFilter,
  NotificationPage,
} from "@/lib/messages/server";
import { cn } from "@/lib/utils";
import { requestNotificationJson as requestJson } from "./client";
import { useNotifications } from "./notification-provider";

export function NotificationsExperience({
  initialPage,
}: {
  initialPage: NotificationPage;
}) {
  const [page, setPage] = useState(initialPage);
  const notifications = useNotifications();
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actionFocus = useRef<{ element: HTMLElement; index: number } | null>(
    null,
  );
  const unread = notifications.page?.unreadCount ?? page.unreadCount;
  const visibleNotifications = groupNotifications(
    page.notifications.filter((item) => {
      if (filter === "archived") return item.archived;
      if (filter === "unread") return !item.archived && !item.read;
      return !item.archived;
    }),
  );

  useEffect(() => {
    const target = actionFocus.current;
    if (pending || !target) return;
    actionFocus.current = null;
    if (
      document.activeElement !== document.body &&
      document.activeElement !== target.element
    )
      return;
    if (document.contains(target.element)) target.element.focus();
    else {
      const links =
        contentRef.current?.querySelectorAll<HTMLAnchorElement>("article a");
      const next = links?.[Math.min(target.index, links.length - 1)];
      (next ?? headingRef.current)?.focus();
    }
  }, [pending]);

  async function updateNotification(
    notificationIds: string[] | null,
    action: NotificationAction,
    groupKey?: string,
  ) {
    if (pending) return false;
    const element = document.activeElement;
    if (
      element instanceof HTMLElement &&
      contentRef.current?.contains(element)
    ) {
      const rows = [...contentRef.current.querySelectorAll("article")];
      actionFocus.current = {
        element,
        index: Math.max(0, rows.indexOf(element.closest("article")!)),
      };
    }
    setPending(true);
    setPendingKey(groupKey ?? notificationIds?.[0] ?? null);
    try {
      const ids = notificationIds ?? [null];
      const responses = await Promise.allSettled(
        ids.map((notificationId) =>
          requestJson("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notificationId, action }),
          }),
        ),
      );
      const succeeded = ids.filter(
        (_, index) => responses[index].status === "fulfilled",
      );
      const allSucceeded = responses.every(
        (response) => response.status === "fulfilled",
      );
      if (!allSucceeded)
        toast.error(
          "Some notifications couldn't be updated. Please try again.",
        );
      setPage((current) => ({
        ...current,
        notifications:
          action === "delete"
            ? current.notifications.filter(
                (item) => !succeeded.includes(item.id),
              )
            : current.notifications.map((item) => {
                if (!succeeded.includes(null) && !succeeded.includes(item.id))
                  return item;
                if (action === "mark-read")
                  return succeeded.includes(null) && item.archived
                    ? item
                    : { ...item, read: true };
                if (action === "mark-unread") return { ...item, read: false };
                if (action === "archive") return { ...item, archived: true };
                if (action === "restore") return { ...item, archived: false };
                return item;
              }),
      }));
      await notifications.refresh();
      return allSucceeded;
    } finally {
      setPendingKey(null);
      setPending(false);
    }
  }

  async function selectFilter(value: NotificationFilter) {
    if (pending) return;
    setPending(true);
    try {
      const result = await requestJson<NotificationPage>(
        `/api/notifications?filter=${value}`,
      );
      setPage(result);
      setFilter(value);
      await notifications.refresh(false);
    } catch {
      toast.error("We couldn't load notifications. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function loadMore() {
    if (!page.nextCursor || pending) return;
    setPending(true);
    try {
      const result = await requestJson<NotificationPage>(
        `/api/notifications?filter=${filter}&cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      setPage((current) => ({
        notifications: [
          ...current.notifications,
          ...result.notifications.filter(
            (item) =>
              !current.notifications.some(
                (existing) => existing.id === item.id,
              ),
          ),
        ],
        nextCursor: result.nextCursor,
        unreadCount: result.unreadCount,
      }));
    } catch {
      toast.error("We couldn't load more notifications. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="px-4 py-5 lg:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
          <div>
            <h1 ref={headingRef} tabIndex={-1} className="font-serif text-3xl">
              Notifications
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {unread} unread notification{unread === 1 ? "" : "s"} in your
              inbox.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => void selectFilter(filter)}
              className="text-primary hover:bg-muted flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold disabled:opacity-50"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Refresh
            </button>
            {unread > 0 && filter !== "archived" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => void updateNotification(null, "mark-read")}
                title="Marks unread inbox notifications across all pages. Archived notifications stay unchanged."
                className="text-primary hover:bg-muted flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold disabled:opacity-50"
              >
                <CheckCheck aria-hidden="true" className="size-4" />
                Mark all read
              </button>
            )}
          </div>
        </header>
        {notifications.error && (
          <p role="status" className="bg-muted mb-4 rounded-lg p-3 text-sm">
            Notification counts may be out of date. Use Refresh to try again.
          </p>
        )}

        <div
          role="group"
          aria-label="Notification filters"
          className="bg-muted mb-4 flex w-full gap-1 rounded-lg p-1 sm:w-fit"
        >
          {(["all", "unread", "archived"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              disabled={pending}
              onClick={() => void selectFilter(value)}
              className={cn(
                "min-h-11 flex-1 rounded-md px-4 text-sm font-semibold capitalize disabled:opacity-50 sm:flex-none",
                filter === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>

        {filter === "archived" && (
          <p className="text-muted-foreground mb-3 text-sm">
            Archived notifications keep their read status. Unarchiving an unread
            update returns it to your inbox count.
          </p>
        )}
        {visibleNotifications.length ? (
          <div ref={contentRef} className="surface-card overflow-hidden">
            {visibleNotifications.map((notification) => (
              <NotificationRow
                key={notification.key}
                notification={notification}
                pending={pending || pendingKey === notification.key}
                onAction={(action) =>
                  void updateNotification(
                    notification.ids,
                    action,
                    notification.key,
                  )
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
              {page.nextCursor
                ? "No updates on this page"
                : filter === "archived"
                  ? "No archived updates"
                  : "You're all caught up"}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {page.nextCursor
                ? "Load more to check older notifications."
                : filter === "archived"
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
  notification: NotificationGroup;
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
            {notification.read ? (
              <Mail aria-hidden="true" className="size-3.5" />
            ) : (
              <CheckCheck aria-hidden="true" className="size-3.5" />
            )}
          </NotificationActionButton>
          <NotificationActionButton
            label={notification.archived ? "Unarchive" : "Archive"}
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
