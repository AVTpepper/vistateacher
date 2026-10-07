"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/http/client";

export function DeletionStatusPanel() {
  const [status, setStatus] = useState("loading");
  const [phase, setPhase] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const receipt = window.location.hash.slice(1);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const result = await requestJson<{ status: string; phase: string }>(
          "/api/settings/deletion/status",
          { headers: { "x-deletion-receipt": receipt } },
        );
        if (!active) return;
        setStatus(result.status);
        setPhase(result.phase);
        if (["pending", "processing"].includes(result.status))
          timer = setTimeout(() => void check(), 5_000);
      } catch {
        if (active) setStatus("unavailable");
      }
    };
    void check();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [attempt]);
  return (
    <section className="surface-card mx-auto max-w-xl space-y-5 p-6 sm:p-8">
      <h1 className="font-serif text-3xl">
        {status === "complete"
          ? "Your account has been deleted"
          : "Account deletion"}
      </h1>
      <div role="status" className="text-muted-foreground text-sm leading-6">
        {status === "complete"
          ? "Your login, profile, uploads, and private account data have been removed. Subscription renewal has been canceled. Limited billing and moderation records are retained separately."
          : status === "failed"
            ? phase === "billing"
              ? "Billing cancellation needs attention before deletion can continue. Your account remains available. Contact support or retry from Settings."
              : "Your account access has been blocked. Some data still needs removal; an administrator can retry your deletion. Keep this page link and contact support."
            : status === "unavailable"
              ? "We couldn't retrieve your deletion status. Check your connection and retry."
              : "We are canceling billing and removing your account data. This page updates automatically."}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Refresh status
        </Button>
        <Button asChild variant="ghost">
          <Link href="/help">Contact support</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Return home</Link>
        </Button>
      </div>
    </section>
  );
}
