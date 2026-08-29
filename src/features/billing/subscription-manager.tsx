"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
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
  const [cancelOpen, setCancelOpen] = useState(false);

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
      if (nextCancelAtPeriodEnd) setCancelOpen(false);
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
          <AlertDialog.Root open={cancelOpen} onOpenChange={setCancelOpen}>
            <AlertDialog.Trigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={pending !== null}
              >
                <XCircle aria-hidden="true" />
                Cancel at period end
              </Button>
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
              <AlertDialog.Content className="bg-card fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-xl">
                <AlertDialog.Title className="font-serif text-2xl">
                  Turn off Plus renewal?
                </AlertDialog.Title>
                <AlertDialog.Description className="text-muted-foreground mt-3 text-sm leading-6">
                  Your Plus access continues
                  {periodEndLabel
                    ? ` through ${periodEndLabel}`
                    : " through the current billing period"}
                  . You will not be charged again unless you restore renewal.
                </AlertDialog.Description>
                <ul className="text-muted-foreground mt-4 space-y-2 text-sm leading-6">
                  <li>Unlimited messaging and connections will end.</li>
                  <li>
                    AI, export, analytics, and Plus resource limits will return
                    to Community access.
                  </li>
                  <li>You can restore renewal before Plus ends.</li>
                </ul>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <AlertDialog.Cancel asChild>
                    <Button variant="outline">Keep Plus</Button>
                  </AlertDialog.Cancel>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={pending !== null}
                    onClick={() => void toggleCancel(true)}
                  >
                    {pending === "cancel" && (
                      <LoaderCircle
                        aria-hidden="true"
                        className="animate-spin"
                      />
                    )}
                    Turn off renewal
                  </Button>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
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
          Payment methods, invoices &amp; receipts
        </Button>
      </div>
    </div>
  );
}
