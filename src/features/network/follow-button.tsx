"use client";

import { LoaderCircle, UserCheck, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

export function FollowButton({
  targetUid,
  connectionStatus,
  connectionDirection = null,
  mode = "follow",
  className,
}: {
  targetUid: string;
  connectionStatus: "none" | "pending" | "accepted" | null;
  connectionDirection?: "incoming" | "outgoing" | null;
  mode?: "follow" | "connect";
  className?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(connectionStatus ?? "none");
  const [direction, setDirection] = useState(connectionDirection);
  const [pending, setPending] = useState(false);

  async function handleConnect() {
    if (status === "pending" && direction === "incoming") {
      // Accept incoming request
      setStatus("accepted");
      setDirection(null);
      setPending(true);
      const response = await fetch("/api/network/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid }),
      });
      setPending(false);
      if (!response.ok) {
        setStatus("none");
        setDirection("incoming");
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(result?.error ?? "We couldn't accept this connection.");
        return;
      }
      router.refresh();
    } else if (status === "accepted" || status === "pending") {
      // Unfollow/disconnect
      const next = "none";
      setStatus(next);
      setDirection(null);
      setPending(true);
      const response = await fetch("/api/network/follow", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid }),
      });
      setPending(false);
      if (!response.ok) {
        setStatus(status);
        setDirection(connectionDirection);
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(result?.error ?? "We couldn't update this connection.");
        return;
      }
      router.refresh();
    } else {
      // Send connection request
      const next = "pending";
      setStatus(next);
      setDirection("outgoing");
      setPending(true);
      const response = await fetch("/api/network/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid }),
      });
      setPending(false);
      if (!response.ok) {
        setStatus("none");
        setDirection(null);
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(result?.error ?? "We couldn't update this connection.");
        return;
      }
      router.refresh();
    }
  }

  const isConnected = status === "accepted";
  const isRequestSent = status === "pending" && direction === "outgoing";
  const hasIncomingRequest = status === "pending" && direction === "incoming";

  return (
    <button
      type="button"
      onClick={handleConnect}
      disabled={pending}
      className={cn(
        "flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors disabled:opacity-60",
        isConnected
          ? "bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : isRequestSent
            ? "bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
            : hasIncomingRequest
              ? "bg-success/10 text-success hover:bg-success/20"
              : "bg-primary text-primary-foreground hover:opacity-90",
        className,
      )}
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
      ) : isConnected ? (
        <UserCheck aria-hidden="true" className="size-3.5" />
      ) : isRequestSent ? (
        <X aria-hidden="true" className="size-3.5" />
      ) : hasIncomingRequest ? (
        <UserCheck aria-hidden="true" className="size-3.5" />
      ) : (
        <UserPlus aria-hidden="true" className="size-3.5" />
      )}
      {mode === "connect"
        ? isConnected
          ? "Connected"
          : isRequestSent
            ? "Request sent"
            : hasIncomingRequest
              ? "Accept request"
              : "Connect"
        : isConnected
          ? "Following"
          : isRequestSent
            ? "Request sent"
            : hasIncomingRequest
              ? "Accept request"
              : "Follow"}
    </button>
  );
}
