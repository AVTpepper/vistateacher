"use client";

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { refreshFirebaseClientAuth } from "@/lib/firebase/client-auth";
import { requestNotificationJson as requestJson } from "./client";
import type { NotificationPage } from "@/lib/messages/server";

interface NotificationState {
  page: NotificationPage | null;
  loading: boolean;
  error: boolean;
  refresh: (includeRecent?: boolean) => Promise<void>;
}

const NotificationContext = createContext<NotificationState | null>(null);

export function NotificationProvider({
  uid,
  children,
}: {
  uid: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const queue = useRef({
    active: true,
    pending: null as Promise<void> | null,
    dirty: false,
    recent: false,
  });

  const refresh = useCallback((includeRecent = true): Promise<void> => {
    const state = queue.current;
    state.dirty = true;
    state.recent ||= includeRecent;
    if (state.pending) return state.pending;
    // Serialize refreshes and replay invalidations received during a request.
    // An older response can never overwrite a newer count.
    state.pending = (async () => {
      while (state.active && state.dirty) {
        const full = state.recent;
        state.dirty = false;
        state.recent = false;
        try {
          const result = await requestJson<
            NotificationPage | { unreadCount: number }
          >(full ? "/api/notifications" : "/api/notifications?summary=true");
          if (!state.active) return;
          setPage((current) =>
            "notifications" in result
              ? result
              : current
                ? { ...current, unreadCount: result.unreadCount }
                : current,
          );
          setError(false);
        } catch {
          if (state.active) setError(true);
        } finally {
          if (state.active) setLoading(false);
        }
      }
    })().finally(() => {
      state.pending = null;
    });
    return state.pending;
  }, []);

  useEffect(() => {
    const state = {
      active: true,
      pending: null as Promise<void> | null,
      dirty: false,
      recent: false,
    };
    queue.current = state;
    let unsubscribe: (() => void) | undefined;
    let initialized = false;
    let newestTimestamp = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void refresh();
    void refreshFirebaseClientAuth()
      .then((client) => {
        if (!state.active) return;
        unsubscribe = onSnapshot(
          query(
            collection(client.db, `users/${uid}/notifications`),
            orderBy("createdAt", "desc"),
            limit(30),
          ),
          (snapshot) => {
            clearTimeout(timer);
            timer = setTimeout(() => void refresh(), 200);
            if (initialized) {
              const newest = snapshot
                .docChanges()
                .find(
                  (change) =>
                    change.type === "added" &&
                    (change.doc.data().createdAt?.toMillis?.() ?? 0) >
                      newestTimestamp &&
                    change.doc.data().read === false &&
                    change.doc.data().archived !== true,
                );
              const data = newest?.doc.data();
              if (data && typeof data.message === "string")
                toast.message(data.message, {
                  action: {
                    label: "View",
                    onClick: () =>
                      router.push(
                        typeof data.href === "string"
                          ? data.href
                          : "/notifications",
                      ),
                  },
                });
            }
            newestTimestamp = Math.max(
              newestTimestamp,
              ...snapshot.docs.map(
                (document) => document.data().createdAt?.toMillis?.() ?? 0,
              ),
            );
            initialized = true;
          },
          () => {
            /* HTTP refresh remains available if realtime disconnects. */
          },
        );
      })
      .catch(() => undefined);
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh(false);
    };
    const interval = setInterval(refreshVisible, 60_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      state.active = false;
      unsubscribe?.();
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh, router, uid]);

  return (
    <NotificationContext.Provider value={{ page, loading, error, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("NotificationProvider is required.");
  return context;
}
