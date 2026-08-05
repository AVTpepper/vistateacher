"use client";

import { CreditCard, LoaderCircle, RefreshCcw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function SubscriptionManager({
  canManageBilling,
  cancelAtPeriodEnd,
  periodEndLabel,
}: {
  canManageBilling: boolean;
  cancelAtPeriodEnd: boolean;
  periodEndLabel: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"cancel" | "resume" | "portal" | null>(
    null,
  );

  async function toggleCancel(nextCancelAtPeriodEnd: boolean) {
    setPending(nextCancelAtPeriodEnd ? "cancel" : "resume");
    try {
      const response = await fetch("/api/billing/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelAtPeriodEnd: nextCancelAtPeriodEnd }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(result?.error ?? "Couldn't update subscription.");
      }
      toast.success(
        nextCancelAtPeriodEnd
          ? "Membership will end at the period boundary."
          : "Automatic renewal restored.",
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setPending(null);
    }
  }

  async function openStripePortal() {
    setPending("portal");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const result = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!response.ok || !result?.url) {
        throw new Error(result?.error ?? "Billing portal is unavailable.");
      }
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed.");
      setPending(null);
    }
  }

  if (!canManageBilling) {
    return (
      <p className="text-muted-foreground text-sm">
        Billing management will appear after your first successful subscription.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6">
        {cancelAtPeriodEnd
          ? `Your membership is scheduled to end${periodEndLabel ? ` on ${periodEndLabel}` : " at the end of this billing period"}.`
          : `Your membership renews automatically${periodEndLabel ? ` on ${periodEndLabel}` : ""}.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {cancelAtPeriodEnd ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void toggleCancel(false)}
          >
            {pending === "resume" ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <RefreshCcw aria-hidden="true" />
            )}
            Resume renewal
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void toggleCancel(true)}
          >
            {pending === "cancel" ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <XCircle aria-hidden="true" />
            )}
            Cancel at period end
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          disabled={pending !== null}
          onClick={() => void openStripePortal()}
        >
          {pending === "portal" ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <CreditCard aria-hidden="true" />
          )}
          Update payment method in Stripe
        </Button>
      </div>
    </div>
  );
}
