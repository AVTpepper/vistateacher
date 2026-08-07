import {
  BadgeCheck,
  CalendarDays,
  Check,
  CircleCheck,
  CreditCard,
  FlaskConical,
  Info,
  ShieldCheck,
} from "lucide-react";

import {
  BillingControls,
  type BillingView,
} from "@/features/billing/billing-controls";
import { billingPlans } from "@/features/billing/plan-details";
import type { PlanIntent } from "@/lib/billing/plan-intent";
import { cn } from "@/lib/utils";

export function BillingPanel({
  billing,
  checkoutStatus = null,
  planIntent = null,
  testMode = false,
}: {
  billing: BillingView;
  checkoutStatus?: "success" | "canceled" | null;
  planIntent?: PlanIntent | null;
  testMode?: boolean;
}) {
  return (
    <div className="space-y-5">
      {testMode && (
        <section
          aria-labelledby="stripe-test-mode-heading"
          className="border-accent/40 bg-accent/10 rounded-lg border p-4"
        >
          <div className="flex items-start gap-3">
            <FlaskConical
              aria-hidden="true"
              className="text-accent-foreground mt-0.5 size-4 shrink-0"
            />
            <div className="min-w-0">
              <h2 id="stripe-test-mode-heading" className="text-sm font-bold">
                Stripe test mode
              </h2>
              <p className="text-foreground mt-1 text-xs leading-5">
                Checkout is using Stripe&apos;s sandbox. No real payment will be
                collected. To simulate a successful subscription, use:
              </p>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-foreground">Card number</dt>
                  <dd>
                    <code className="font-mono font-bold">
                      4242 4242 4242 4242
                    </code>
                  </dd>
                </div>
                <div>
                  <dt className="text-foreground">Expiry</dt>
                  <dd>
                    <code className="font-mono font-bold">12/34</code>
                  </dd>
                </div>
                <div>
                  <dt className="text-foreground">CVC</dt>
                  <dd>
                    <code className="font-mono font-bold">123</code>
                  </dd>
                </div>
                <div>
                  <dt className="text-foreground">Postal code</dt>
                  <dd>
                    <code className="font-mono font-bold">Any valid value</code>
                  </dd>
                </div>
              </dl>
              <p className="text-foreground mt-3 text-[11px] leading-4">
                Never enter a real card while this test notice is shown.
              </p>
            </div>
          </div>
        </section>
      )}
      {planIntent && !checkoutStatus && (
        <div
          role="status"
          className="bg-primary/5 border-primary/20 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
        >
          <Info
            aria-hidden="true"
            className="text-primary mt-0.5 size-4 shrink-0"
          />
          <div>
            <p className="font-bold">Continue with VistaTeacher Plus</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-5">
              Your account is ready. Choose monthly or yearly billing below,
              then complete payment securely without leaving VistaTeacher.
            </p>
          </div>
        </div>
      )}
      {checkoutStatus && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
            checkoutStatus === "success"
              ? "border-success/30 bg-success/10"
              : "bg-muted/60",
          )}
        >
          {checkoutStatus === "success" ? (
            <CircleCheck
              aria-hidden="true"
              className="text-success mt-0.5 size-4 shrink-0"
            />
          ) : (
            <Info
              aria-hidden="true"
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
            />
          )}
          <div>
            <p className="font-bold">
              {checkoutStatus === "success"
                ? "Checkout complete"
                : "Checkout canceled"}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-5">
              {checkoutStatus === "success"
                ? "Your payment was received. Plus access updates after Stripe confirms the subscription."
                : "No payment was made. Your current plan is unchanged."}
            </p>
          </div>
        </div>
      )}
      <section className="surface-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-primary font-mono text-[10px] font-bold uppercase">
              Current access
            </p>
            <h2 className="mt-2 font-serif text-2xl">
              {billing.effectivePlan === "plus"
                ? "VistaTeacher Plus"
                : "VistaTeacher Community"}
            </h2>
            {billing.effectivePlan === "free" && (
              <p className="text-muted-foreground mt-1 text-sm">
                $0 membership fee
              </p>
            )}
          </div>
          <span className="bg-primary/10 grid size-11 place-items-center rounded-lg">
            <BadgeCheck className="text-primary size-5" />
          </span>
        </div>
        <BillingControls billing={billing} />
      </section>

      <section aria-labelledby="plan-comparison-heading">
        <div className="mb-4">
          <p className="text-primary font-mono text-[10px] font-bold uppercase">
            Plan comparison
          </p>
          <h2 id="plan-comparison-heading" className="mt-2 font-serif text-2xl">
            Choose the access that fits your work
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {billingPlans.map((plan) => {
            const isCurrent = billing.effectivePlan === plan.id;
            return (
              <article
                key={plan.id}
                className={cn(
                  "surface-card p-5",
                  isCurrent && "border-primary ring-primary/15 ring-2",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl">{plan.name}</h3>
                    <p className="mt-3 font-serif text-4xl">
                      {plan.price}
                      <span className="text-muted-foreground font-sans text-xs">
                        {plan.priceSuffix}
                      </span>
                    </p>
                  </div>
                  {isCurrent && (
                    <span className="bg-primary/10 text-primary rounded-md px-2 py-1 text-[10px] font-bold uppercase">
                      Current plan
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  {plan.note}
                </p>
                <ul className="mt-5 space-y-2.5 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5">
                      <Check
                        aria-hidden="true"
                        className="text-success mt-0.5 size-4 shrink-0"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          [
            ShieldCheck,
            "Server-owned",
            "Plans change only after trusted billing events.",
          ],
          [
            CalendarDays,
            "Flexible access",
            "Choose Plus whenever its expanded tools fit your work.",
          ],
          [
            CreditCard,
            "Stripe-secured",
            "Payment details never enter VistaTeacher.",
          ],
        ].map(([Icon, title, description]) => (
          <div key={String(title)} className="surface-card p-4">
            <Icon className="text-primary size-4" />
            <h3 className="mt-3 text-sm font-bold">{String(title)}</h3>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              {String(description)}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
