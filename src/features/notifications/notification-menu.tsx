"use client";

import { Bell, Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";

import type { NotificationItem, NotificationPage } from "@/lib/messages/server";
import { cn } from "@/lib/utils";

interface NotificationGroup {
  key: string;
  ids: string[];
  message: string;
  href: string;
  read: boolean;
  createdAt: string;
}

export function NotificationMenu({ onOpen }: { onOpen?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingReads = useRef<Promise<Response>[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/notifications", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        setPage((await response.json()) as NotificationPage);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const active = page?.notifications.filter((item) => !item.archived) ?? [];
  const recent = groupNotifications(active).slice(0, 5);
  const unread = active.filter((item) => !item.read).length;

  function markRead(notificationIds: string[]) {
    setPage((current) =>
      current
        ? {
            ...current,
            notifications: current.notifications.map((item) =>
              notificationIds.includes(item.id)
                ? { ...item, read: true }
                : item,
            ),
          }
        : current,
    );
    for (const notificationId of notificationIds) {
      const request = fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId, action: "mark-read" }),
        keepalive: true,
      });
      pendingReads.current.push(request);
      void request.finally(() => {
        pendingReads.current = pendingReads.current.filter(
          (pending) => pending !== request,
        );
      });
    }
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label={
          unread ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-controls="notification-menu"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) onOpen?.();
        }}
        className="relative grid size-11 shrink-0 place-items-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
      >
        <Bell aria-hidden="true" className="size-4.5" />
        {unread > 0 && (
          <span className="bg-accent text-accent-foreground absolute top-1.5 right-1.5 grid min-h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            id="notification-menu"
            aria-label="Recent notifications"
            className="bg-card text-card-foreground border-border fixed inset-x-3 top-16 z-50 overflow-hidden rounded-b-xl border-2 shadow-xl sm:absolute sm:inset-x-auto sm:top-12 sm:right-0 sm:w-96 sm:rounded-xl"
          >
            <div className="border-border flex min-h-12 items-center justify-between border-b px-4">
              <p className="font-serif text-lg">Notifications</p>
              {unread > 0 && (
                <span className="text-muted-foreground text-xs font-semibold">
                  {unread} unread
                </span>
              )}
            </div>
            <div className="max-h-[min(28rem,calc(100dvh-9rem))] overflow-y-auto">
              {loading ? (
                <div className="text-muted-foreground flex min-h-28 items-center justify-center gap-2 text-sm">
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                  Loading notifications
                </div>
              ) : recent.length ? (
                recent.map((notification) => (
                  <div
                    key={notification.key}
                    className={cn(
                      "border-border flex gap-2 border-b p-3",
                      !notification.read && "bg-secondary/20",
                    )}
                  >
                    <Link
                      href={notification.href}
                      onClick={() => {
                        if (!notification.read) markRead(notification.ids);
                        setOpen(false);
                      }}
                      className="hover:text-primary min-w-0 flex-1 py-1"
                    >
                      <span
                        className={cn(
                          "block text-sm leading-5",
                          !notification.read && "font-bold",
                        )}
                      >
                        {notification.message}
                      </span>
                      <span className="text-muted-foreground mt-1 block text-xs">
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </Link>
                    {!notification.read && (
                      <button
                        type="button"
                        aria-label={`Mark as read: ${notification.message}`}
                        title="Mark as read"
                        onClick={() => markRead(notification.ids)}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-11 shrink-0 place-items-center rounded-lg"
                      >
                        <Check aria-hidden="true" className="size-4" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="px-5 py-10 text-center">
                  <Bell
                    aria-hidden="true"
                    className="text-muted-foreground/40 mx-auto size-7"
                  />
                  <p className="mt-2 text-sm font-semibold">
                    You&apos;re all caught up
                  </p>
                </div>
              )}
            </div>
            <Link
              href="/notifications"
              onClick={(event) => {
                if (!pendingReads.current.length) {
                  setOpen(false);
                  return;
                }
                event.preventDefault();
                void Promise.allSettled(pendingReads.current).then(() => {
                  setOpen(false);
                  router.push("/notifications");
                });
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 m-3 flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold"
            >
              View all notifications
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function groupNotifications(
  notifications: NotificationItem[],
): NotificationGroup[] {
  const groups = new Map<string, NotificationItem[]>();
  for (const notification of notifications) {
    const aggregate =
      (notification.type === "post-like" ||
        notification.type === "post-comment") &&
      notification.entityId;
    const key = aggregate
      ? `${notification.type}:${notification.entityId}`
      : notification.id;
    groups.set(key, [...(groups.get(key) ?? []), notification]);
  }

  return [...groups.entries()].map(([key, items]) => {
    const latest = items[0];
    const names = [
      ...new Set(
        items.flatMap((item) => (item.actorName ? [item.actorName] : [])),
      ),
    ];
    const action = latest.type === "post-like" ? "liked" : "commented on";
    return {
      key,
      ids: items.map((item) => item.id),
      message:
        items.length > 1 && names.length
          ? `${formatActorNames(names, items.length)} ${action} your post.`
          : latest.message,
      href: latest.href,
      read: items.every((item) => item.read),
      createdAt: latest.createdAt,
    };
  });
}

function formatActorNames(names: string[], total: number) {
  if (total === 1) return names[0];
  if (total === 2 && names.length >= 2) return `${names[0]} and ${names[1]}`;
  const visibleNames = names.slice(0, 3);
  const remaining = total - visibleNames.length;
  if (remaining > 0)
    return `${visibleNames.join(", ")}, and ${remaining} ${remaining === 1 ? "other" : "others"}`;
  return `${visibleNames.slice(0, -1).join(", ")}, and ${visibleNames.at(-1)}`;
}
