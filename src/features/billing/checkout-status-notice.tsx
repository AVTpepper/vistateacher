"use client";

import { CircleCheck, Info, LoaderCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CheckoutStatus = "success" | "processing" | "canceled";

export function CheckoutStatusNotice({ status }: { status: CheckoutStatus }) {
  const router = useRouter();
  const [refreshes, setRefreshes] = useState(0);
  const timedOut = status === "processing" && refreshes >= 12;

  useEffect(() => {
    if (status !== "processing" || timedOut) return;
    const timer = window.setTimeout(() => {
      setRefreshes((value) => value + 1);
      router.refresh();
    }, 2_500);
    return () => window.clearTimeout(timer);
  }, [refreshes, router, status, timedOut]);

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        status === "success"
          ? "border-success/30 bg-success/10"
          : status === "processing"
            ? "border-accent/30 bg-accent/10"
            : "bg-muted/60",
      )}
    >
      {status === "success" ? (
        <CircleCheck
          aria-hidden="true"
          className="text-success mt-0.5 size-4 shrink-0"
        />
      ) : status === "processing" && !timedOut ? (
        <LoaderCircle
          aria-hidden="true"
          className="text-accent-readable mt-0.5 size-4 shrink-0 animate-spin"
        />
      ) : (
        <Info
          aria-hidden="true"
          className="text-muted-foreground mt-0.5 size-4 shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {status === "success"
            ? "Plus is active"
            : status === "processing"
              ? timedOut
                ? "Payment confirmation is taking longer than expected"
                : "Activating VistaTeacher Plus"
              : "Checkout canceled"}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs leading-5">
          {status === "success"
            ? "Your payment was confirmed and VistaTeacher Plus is active."
            : status === "processing"
              ? timedOut
                ? "Your card will not be charged again by retrying confirmation. You can refresh the status or contact support."
                : "Payment completed. VistaTeacher is securely confirming your subscription; this page will update automatically."
              : "No payment was made. Your current plan is unchanged."}
        </p>
        {timedOut && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" type="button" onClick={() => setRefreshes(0)}>
              <RotateCcw aria-hidden="true" />
              Retry confirmation
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/help">Contact support</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
