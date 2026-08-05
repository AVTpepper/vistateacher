"use client";

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { useState } from "react";

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
  const [stripePromise] = useState(() => loadStripe(publishableKey));
  const [options] = useState(() => ({
    fetchClientSecret: async () => {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
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
      return result.clientSecret;
    },
  }));

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(15rem,0.38fr)_minmax(0,1fr)]">
      <aside className="space-y-5 lg:sticky lg:top-6">
        <div>
          <p className="text-primary font-mono text-[10px] font-bold uppercase">
            VistaTeacher Plus
          </p>
          <p className="mt-3 font-serif text-4xl">
            {interval === "month" ? "$9" : "$79"}
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
        <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    </div>
  );
}
