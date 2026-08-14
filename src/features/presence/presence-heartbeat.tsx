"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;

export function PresenceHeartbeat() {
  useEffect(() => {
    function heartbeat() {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/presence", {
        method: "POST",
        keepalive: true,
      }).catch(() => undefined);
    }

    heartbeat();
    const interval = window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", heartbeat);
    window.addEventListener("focus", heartbeat);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", heartbeat);
      window.removeEventListener("focus", heartbeat);
    };
  }, []);

  return null;
}
