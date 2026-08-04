import {
  BadgeCheck,
  CalendarDays,
  CreditCard,
  ShieldCheck,
} from "lucide-react";

import {
  BillingControls,
  type BillingView,
} from "@/features/billing/billing-controls";

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
          </div>
          <span className="bg-primary/10 grid size-11 place-items-center rounded-lg">
            <BadgeCheck className="text-primary size-5" />
          </span>
        </div>
        <BillingControls billing={billing} />
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
