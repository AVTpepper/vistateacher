"use client";

import { CreditCard, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
    | "canceled"
    | "incomplete";
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
  const [interval, setInterval] = useState<BillingInterval>(
    billing.billingInterval ?? "month",
  );
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);

  async function action(kind: "checkout" | "portal"): Promise<void> {
    setPending(kind);
    const response = await fetch(`/api/billing/${kind}`, {
      method: "POST",
      headers:
        kind === "checkout"
          ? { "Content-Type": "application/json" }
          : undefined,
      body: kind === "checkout" ? JSON.stringify({ interval }) : undefined,
    });
    const result = (await response.json().catch(() => null)) as {
      url?: string;
      error?: string;
    } | null;
    setPending(null);
    if (!response.ok) {
      toast.error(result?.error ?? "Billing is temporarily unavailable.");
      return;
    }
    if (result?.url) {
      window.location.assign(result.url);
      return;
    }
    toast.error("Billing did not return a destination. Please try again.");
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
          className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1"
          aria-label="Billing interval"
        >
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={interval === value}
              onClick={() => setInterval(value)}
              className={cn(
                "h-9 rounded-md text-xs font-bold",
                interval === value && "bg-card text-primary shadow-sm",
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
    free: "You are using VistaTeacher Community.",
    vista_trial: `Your temporary Plus access is active${trialEnd ? ` through ${trialEnd}` : ""}.`,
    active: billing.cancelAtPeriodEnd
      ? `Your Plus access continues${periodEnd ? ` through ${periodEnd}` : " until the billing period ends"}.`
      : `Your Plus membership is active${periodEnd ? ` and renews on ${periodEnd}` : ""}.`,
    trialing: `Your Plus membership is active${periodEnd ? ` through ${periodEnd}` : ""}.`,
    past_due:
      "Your latest payment needs attention. Update it in the billing portal.",
    canceled:
      "Your paid membership has ended. You can choose Plus again at any time.",
    incomplete:
      "Your Plus setup is incomplete. Resume checkout or manage billing.",
  };
  return (
    <p
      className={cn(
        "text-sm leading-6 font-semibold",
        billing.lifecycle === "past_due" && "text-destructive",
      )}
    >
      {messages[billing.lifecycle]}
    </p>
  );
}
