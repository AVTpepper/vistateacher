"use client";

import { LoaderCircle, UserCheck, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/http/client";

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
    if (pending) return;
    const previous = { status, direction };
    const accepting = status === "pending" && direction === "incoming";
    const removing = !accepting && status !== "none";
    setStatus(accepting ? "accepted" : removing ? "none" : "pending");
    setDirection(accepting || removing ? null : "outgoing");
    setPending(true);
    try {
      await requestJson(
        accepting ? "/api/network/accept" : "/api/network/follow",
        {
          method: removing ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUid }),
        },
      );
      router.refresh();
    } catch (error) {
      setStatus(previous.status);
      setDirection(previous.direction);
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't update this connection.",
      );
    } finally {
      setPending(false);
    }
  }

  const isConnected = status === "accepted";
  const isRequestSent = status === "pending" && direction === "outgoing";
  const hasIncomingRequest = status === "pending" && direction === "incoming";

  return (
    <Button
      type="button"
      onClick={handleConnect}
      disabled={pending}
      aria-busy={pending}
      title={
        isConnected
          ? "Remove connection"
          : isRequestSent
            ? "Cancel connection request"
            : undefined
      }
      variant={isConnected || isRequestSent ? "outline" : "default"}
      size="sm"
      className={className}
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
    </Button>
  );
}
