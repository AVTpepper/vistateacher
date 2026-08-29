"use client";

import { CreditCard, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BillingInterval } from "@/schemas/billing";

export interface BillingView {
  effectivePlan: "free" | "plus";
  lifecycle:
    | "free"
    | "vista_trial"
    | "active"
    | "trialing"
    | "past_due"
    | "unpaid"
    | "paused"
    | "canceled"
    | "incomplete"
    | "incomplete_expired";
  billingInterval: BillingInterval | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  canStartTrial: boolean;
  canCheckout: boolean;
  canManageBilling: boolean;
}

function formattedDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function BillingControls({
  billing,
  compact = false,
}: {
  billing: BillingView;
  compact?: boolean;
}) {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>(
    billing.billingInterval ?? "month",
  );
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);

  async function action(kind: "checkout" | "portal"): Promise<void> {
    if (kind === "checkout") {
      setPending(kind);
      router.push(`/settings/billing/checkout?interval=${interval}`);
      return;
    }

    setPending(kind);
    router.push("/settings/billing/manage");
  }

  const periodEnd = formattedDate(billing.currentPeriodEnd);
  const trialEnd = formattedDate(billing.trialEndsAt);

  return (
    <div className={cn("space-y-4", compact && "mt-7")}>
      <LifecycleMessage
        billing={billing}
        periodEnd={periodEnd}
        trialEnd={trialEnd}
      />

      {billing.canCheckout && (
        <div
          className={cn(
            "grid grid-cols-2 gap-1 rounded-lg p-1",
            compact ? "border border-white/25 bg-black/35" : "bg-muted",
          )}
          aria-label="Billing interval"
        >
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={interval === value}
              onClick={() => setInterval(value)}
              className={cn(
                "h-9 rounded-md text-xs font-bold transition-colors",
                interval === value
                  ? compact
                    ? "bg-white text-[#4b2638] shadow-sm"
                    : "bg-card text-primary shadow-sm"
                  : compact
                    ? "text-white hover:bg-white/10"
                    : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "month" ? "$9 monthly" : "$79 yearly"}
            </button>
          ))}
        </div>
      )}

      <div className={cn("flex flex-wrap gap-2", compact && "flex-col")}>
        {billing.canCheckout && (
          <Button
            className={cn(compact && "w-full")}
            size={compact ? "lg" : "default"}
            disabled={pending !== null}
            onClick={() => action("checkout")}
          >
            {pending === "checkout" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <CreditCard />
            )}
            Choose Plus
          </Button>
        )}
        {billing.canManageBilling && (
          <Button
            className={cn(compact && "w-full")}
            variant="outline"
            size={compact ? "lg" : "default"}
            disabled={pending !== null}
            onClick={() => action("portal")}
          >
            {pending === "portal" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <CreditCard />
            )}
            Manage billing
          </Button>
        )}
      </div>
    </div>
  );
}

function LifecycleMessage({
  billing,
  periodEnd,
  trialEnd,
}: {
  billing: BillingView;
  periodEnd: string | null;
  trialEnd: string | null;
}) {
  const messages: Record<BillingView["lifecycle"], string> = {
    free: "You are using VistaTeacher Community. Your membership fee is $0.",
    vista_trial: `Your temporary Plus access is active${trialEnd ? ` through ${trialEnd}` : ""}.`,
    active: billing.cancelAtPeriodEnd
      ? `Your Plus access continues${periodEnd ? ` through ${periodEnd}` : " until the billing period ends"}.`
      : `Your Plus membership is active${periodEnd ? ` and renews on ${periodEnd}` : ""}.`,
    trialing: `Your Plus membership is active${periodEnd ? ` through ${periodEnd}` : ""}.`,
    past_due:
      "Your latest payment needs attention. Update it in the billing portal.",
    unpaid:
      "Payment could not be recovered. Update your payment method to restore Plus.",
    paused: "Your Plus membership is paused. Manage billing to restore access.",
    canceled:
      "Your paid membership has ended. You can choose Plus again at any time.",
    incomplete:
      "Your Plus setup is incomplete. Resume checkout or manage billing.",
    incomplete_expired:
      "Your previous checkout expired. You can choose Plus again when you’re ready.",
  };
  return (
    <p
      className={cn(
        "text-sm leading-6 font-semibold",
        ["past_due", "unpaid", "paused", "incomplete"].includes(
          billing.lifecycle,
        ) && "text-destructive",
      )}
    >
      {messages[billing.lifecycle]}
    </p>
  );
}
