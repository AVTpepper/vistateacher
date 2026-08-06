"use client";

import { LoaderCircle, UserCheck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

export function FollowButton({
  targetUid,
  initialFollowing,
  mode = "follow",
  className,
}: {
  targetUid: string;
  initialFollowing: boolean;
  mode?: "follow" | "connect";
  className?: string;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !following;
    setFollowing(next);
    setPending(true);
    const response = await fetch("/api/network/follow", {
      method: next ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUid }),
    });
    setPending(false);
    if (!response.ok) {
      setFollowing(!next);
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      toast.error(result?.error ?? "We couldn't update this connection.");
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={cn(
        "flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors disabled:opacity-60",
        following
          ? "bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "bg-primary text-primary-foreground hover:opacity-90",
        className,
      )}
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
      ) : following ? (
        <UserCheck aria-hidden="true" className="size-3.5" />
      ) : (
        <UserPlus aria-hidden="true" className="size-3.5" />
      )}
      {mode === "connect"
        ? following
          ? "Connected"
          : "Connect"
        : following
          ? "Following"
          : "Follow"}
    </button>
  );
}
