import "server-only";

import Stripe from "stripe";
import { z } from "zod";

import { normalizeStripeStatus } from "@/lib/billing/policy";
import type {
  BillingProvider,
  CheckoutSessionInput,
  NormalizedBillingEvent,
  PortalSessionInput,
} from "@/lib/billing/provider";
import { resolveStripeMode, stripeModeSchema } from "@/lib/billing/stripe-mode";
import type { BillingInterval } from "@/schemas/billing";

const stripeEnvSchema = z.object({
  STRIPE_MODE: stripeModeSchema.default("TEST"),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PRICE_PLUS_MONTHLY: z.string().startsWith("price_").optional(),
  STRIPE_PRICE_PLUS_YEARLY: z.string().startsWith("price_").optional(),
  STRIPE_PLUS_PRICE_ID: z.string().startsWith("price_").optional(),
});

function stripeId(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function originUrl(origin: string, path: string): string {
  return new URL(path, `${origin}/`).toString();
}

class StripeBillingProvider implements BillingProvider {
  private readonly client: Stripe;
  private readonly env: z.infer<typeof stripeEnvSchema>;

  constructor() {
    this.env = stripeEnvSchema.parse(process.env);
    resolveStripeMode(this.env.STRIPE_MODE, this.env.STRIPE_SECRET_KEY);
    this.client = new Stripe(this.env.STRIPE_SECRET_KEY);
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<string> {
    const priceId =
      input.interval === "month"
        ? (this.env.STRIPE_PRICE_PLUS_MONTHLY ?? this.env.STRIPE_PLUS_PRICE_ID)
        : this.env.STRIPE_PRICE_PLUS_YEARLY;
    if (!priceId) throw new Error("Stripe price is not configured.");

    const session = await this.client.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: input.customerId ?? undefined,
      customer_email: input.customerId ? undefined : input.email,
      client_reference_id: input.uid,
      metadata: { uid: input.uid },
      subscription_data: { metadata: { uid: input.uid } },
      success_url: originUrl(
        input.origin,
        "/settings/billing?checkout=success",
      ),
      cancel_url: originUrl(
        input.origin,
        "/settings/billing?checkout=canceled",
      ),
      allow_promotion_codes: true,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return session.url;
  }

  async createPortalSession(input: PortalSessionInput): Promise<string> {
    const session = await this.client.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: originUrl(input.origin, "/settings/billing"),
    });
    return session.url;
  }

  constructWebhookEvent(
    body: string,
    signature: string,
  ): NormalizedBillingEvent | null {
    const event = this.client.webhooks.constructEvent(
      body,
      signature,
      this.env.STRIPE_WEBHOOK_SECRET,
    );
    const createdAt = new Date(event.created * 1_000);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const uid = session.client_reference_id ?? session.metadata?.uid;
      const customerId = stripeId(session.customer);
      const subscriptionId = stripeId(session.subscription);
      if (!uid || !customerId || !subscriptionId) return null;
      return {
        id: event.id,
        type: "checkout.completed",
        uid,
        createdAt,
        customerId,
        subscriptionId,
      };
    }

    if (
      event.type !== "customer.subscription.created" &&
      event.type !== "customer.subscription.updated" &&
      event.type !== "customer.subscription.deleted"
    ) {
      return null;
    }

    const subscription = event.data.object;
    const item = subscription.items.data[0];
    const interval = item?.price.recurring?.interval;
    const billingInterval: BillingInterval | null =
      interval === "month" ? "month" : interval === "year" ? "year" : null;
    const customerId = stripeId(subscription.customer);
    const uid = subscription.metadata.uid;
    if (!item || !uid || !customerId || !billingInterval) {
      return null;
    }

    return {
      id: event.id,
      type: "subscription.updated",
      uid,
      createdAt,
      customerId,
      subscriptionId: subscription.id,
      priceId: item.price.id,
      interval: billingInterval,
      status: normalizeStripeStatus(subscription.status),
      currentPeriodEnd: item.current_period_end
        ? new Date(item.current_period_end * 1_000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  }
}

let provider: BillingProvider | undefined;

export function getBillingProvider(): BillingProvider {
  provider ??= new StripeBillingProvider();
  return provider;
}
