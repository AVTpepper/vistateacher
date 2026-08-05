import {
  BadgeCheck,
  CalendarDays,
  Check,
  CreditCard,
  ShieldCheck,
} from "lucide-react";

import {
  BillingControls,
  type BillingView,
} from "@/features/billing/billing-controls";
import { billingPlans } from "@/features/billing/plan-details";
import { cn } from "@/lib/utils";

export function BillingPanel({ billing }: { billing: BillingView }) {
  return (
    <div className="space-y-5">
      <section className="bg-card rounded-xl border p-6">
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
                  "bg-card rounded-xl border p-5",
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
          <div key={String(title)} className="bg-card rounded-lg border p-4">
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
