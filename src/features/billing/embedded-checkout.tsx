"use client";
import { PLUS_PRICING, plusPriceLabel } from "@/lib/billing/pricing";

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  Check,
  FlaskConical,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/http/client";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { BillingInterval } from "@/schemas/billing";

export function EmbeddedCheckoutPanel({
  interval,
  publishableKey,
  testMode,
}: {
  interval: BillingInterval;
  publishableKey: string;
  testMode: boolean;
}) {
  const router = useRouter();
  const [canceling, setCanceling] = useState(false);
  async function cancelCheckout(retry = false) {
    if (canceling) return;
    setCanceling(true);
    try {
      await requestJson("/api/billing/checkout/cancel", { method: "POST" });
      if (retry) {
        setError(null);
        setAttempt((value) => value + 1);
      } else router.push("/settings/billing?checkout=canceled");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Checkout could not be canceled.",
      );
    } finally {
      setCanceling(false);
    }
  }
  const [stripePromise] = useState(() => loadStripe(publishableKey));
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${interval}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => null)) as {
        clientSecret?: string;
        error?: string;
      } | null;
      if (!response.ok || !result?.clientSecret) {
        throw new Error(
          result?.error ?? "Embedded checkout is temporarily unavailable.",
        );
      }
      setClientSecret(result.clientSecret);
      setLoadedKey(requestKey);
      setError(null);
    })().catch((caught) => {
      if (controller.signal.aborted) return;
      setLoadedKey(requestKey);
      setError(
        caught instanceof Error
          ? caught.message
          : "Embedded checkout is temporarily unavailable.",
      );
    });
    return () => controller.abort();
  }, [attempt, interval, requestKey]);

  const options = useMemo(
    () => (loadedKey === requestKey && clientSecret ? { clientSecret } : null),
    [clientSecret, loadedKey, requestKey],
  );

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(15rem,0.38fr)_minmax(0,1fr)]">
      <aside className="space-y-5 lg:sticky lg:top-6">
        <div>
          <p className="text-primary font-mono text-[10px] font-bold uppercase">
            VistaTeacher Plus
          </p>
          <p className="mt-3 font-serif text-4xl">
            {PLUS_PRICING[interval].label}
            <span className="text-muted-foreground font-sans text-xs">
              {interval === "month" ? " / month" : " / year"}
            </span>
          </p>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            Complete payment without leaving VistaTeacher. Payment details go
            directly to Stripe and never pass through our servers.
          </p>
        </div>
        <div className="flex items-start gap-3 border-y py-4 text-xs leading-5">
          <ShieldCheck
            aria-hidden="true"
            className="text-primary mt-0.5 size-4 shrink-0"
          />
          <p className="text-muted-foreground">
            Stripe securely processes the subscription and billing details.
          </p>
        </div>
        <div className="space-y-3 text-sm">
          {[
            "Unlimited connections and messages",
            "50 AI generations each month",
            "Unlimited lesson exports",
            "Full analytics and Plus resources",
          ].map((benefit) => (
            <p key={benefit} className="flex items-start gap-2">
              <Check className="text-success mt-0.5 size-4 shrink-0" />
              {benefit}
            </p>
          ))}
        </div>
        <div className="text-muted-foreground space-y-2 text-xs leading-5">
          <p>
            {plusPriceLabel(interval)}. Your membership renews automatically
            until canceled. Stripe shows the final amount before payment.
          </p>
          <p>
            By subscribing, you agree to the{" "}
            <Link
              className="text-primary font-bold hover:underline"
              href="/terms"
            >
              Terms
            </Link>
            . Need help?{" "}
            <Link
              className="text-primary font-bold hover:underline"
              href="/help"
            >
              Contact support
            </Link>
            .
          </p>
          <Button
            type="button"
            variant="ghost"
            disabled={canceling}
            onClick={() => void cancelCheckout()}
          >
            {canceling ? "Canceling..." : "Cancel checkout"}
          </Button>
        </div>
        {testMode && (
          <div className="border-accent/40 bg-accent/10 rounded-lg border p-4 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <FlaskConical aria-hidden="true" className="size-4" />
              Stripe test mode
            </div>
            <p className="text-muted-foreground mt-2 leading-5">
              Use <code className="font-mono">4242 4242 4242 4242</code>, expiry{" "}
              <code className="font-mono">12/34</code>, CVC{" "}
              <code className="font-mono">123</code>, and any valid postal code.
              No real payment is collected.
            </p>
          </div>
        )}
      </aside>

      <div className="min-w-0">
        {error ? (
          <div className="surface-card p-6 text-center sm:p-8" role="alert">
            <h2 className="font-serif text-2xl">Checkout couldn&apos;t load</h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm leading-6">
              {error}
            </p>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                <RotateCcw aria-hidden="true" />
                Retry checkout
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={canceling}
                onClick={() => void cancelCheckout(true)}
                className="h-auto min-h-11 max-w-full py-3 whitespace-normal"
              >
                Close previous checkout and retry
              </Button>
              <Button asChild variant="outline">
                <Link href="/settings/billing">Back to plans</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/help">Contact support</Link>
              </Button>
            </div>
          </div>
        ) : options ? (
          <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        ) : (
          <div className="surface-card text-muted-foreground flex min-h-80 items-center justify-center gap-2 text-sm">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Loading secure checkout
          </div>
        )}
      </div>
    </div>
  );
}
