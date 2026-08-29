import "server-only";

import Stripe from "stripe";
import { z } from "zod";

import { normalizeStripeStatus } from "@/lib/billing/policy";
import type {
  BillingProvider,
  BillingAccountSummary,
  CheckoutSessionInput,
  NormalizedBillingEvent,
  PortalSessionInput,
  SubscriptionCancellationInput,
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
      ui_mode: "embedded_page",
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: input.customerId ?? undefined,
      customer_email: input.customerId ? undefined : input.email,
      client_reference_id: input.uid,
      metadata: { uid: input.uid, interval: input.interval },
      subscription_data: {
        metadata: { uid: input.uid, interval: input.interval },
      },
      return_url: originUrl(
        input.origin,
        "/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      ),
      allow_promotion_codes: true,
    });
    if (!session.client_secret)
      throw new Error("Stripe did not return a Checkout client secret.");
    return session.client_secret;
  }

  async retrieveCompletedCheckout(
    sessionId: string,
    expectedUid: string,
  ): Promise<NormalizedBillingEvent | null> {
    const session = await this.client.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    const sessionUid = session.client_reference_id ?? session.metadata?.uid;
    if (
      sessionUid !== expectedUid ||
      session.status !== "complete" ||
      session.payment_status === "unpaid"
    ) {
      return null;
    }

    const subscription =
      typeof session.subscription === "string"
        ? await this.client.subscriptions.retrieve(session.subscription)
        : session.subscription;
    if (!subscription || subscription.metadata.uid !== expectedUid) {
      return null;
    }

    const item = subscription.items.data[0];
    const interval = item?.price.recurring?.interval;
    const billingInterval: BillingInterval | null =
      interval === "month" ? "month" : interval === "year" ? "year" : null;
    const customerId =
      stripeId(subscription.customer) ?? stripeId(session.customer);
    if (!item || !billingInterval || !customerId) return null;

    return {
      id: `checkout-return_${session.id}`,
      type: "subscription.updated",
      uid: expectedUid,
      createdAt: new Date(Math.floor(Date.now() / 1_000) * 1_000),
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

  async createPortalSession(input: PortalSessionInput): Promise<string> {
    const session = await this.client.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: originUrl(input.origin, "/settings/billing"),
    });
    return session.url;
  }

  async updateSubscriptionCancellation(
    input: SubscriptionCancellationInput,
  ): Promise<void> {
    await this.client.subscriptions.update(input.subscriptionId, {
      cancel_at_period_end: input.cancelAtPeriodEnd,
    });
  }

  async getBillingAccountSummary(input: {
    customerId: string;
    subscriptionId: string;
  }): Promise<BillingAccountSummary> {
    const [subscription, customer] = await Promise.all([
      this.client.subscriptions.retrieve(input.subscriptionId, {
        expand: ["default_payment_method"],
      }),
      this.client.customers.retrieve(input.customerId, {
        expand: ["invoice_settings.default_payment_method"],
      }),
    ]);
    const item = subscription.items.data[0];
    const interval = item?.price.recurring?.interval;
    const defaultMethod =
      typeof subscription.default_payment_method === "object"
        ? subscription.default_payment_method
        : !customer.deleted &&
            typeof customer.invoice_settings.default_payment_method === "object"
          ? customer.invoice_settings.default_payment_method
          : null;
    return {
      amount: item?.price.unit_amount ?? null,
      currency: item?.price.currency ?? null,
      interval: interval === "month" || interval === "year" ? interval : null,
      paymentMethod:
        defaultMethod && "card" in defaultMethod && defaultMethod.card
          ? {
              brand: defaultMethod.card.brand,
              last4: defaultMethod.card.last4,
            }
          : null,
    };
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
      const interval = session.metadata?.interval;
      const billingInterval: BillingInterval | null =
        interval === "month" ? "month" : interval === "year" ? "year" : null;
      if (!uid || !customerId || !subscriptionId) return null;
      return {
        id: event.id,
        type: "checkout.completed",
        uid,
        createdAt,
        customerId,
        subscriptionId,
        interval: billingInterval,
      };
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      const subscriptionDetails = invoice.parent?.subscription_details;
      const uid = subscriptionDetails?.metadata?.uid;
      const customerId = stripeId(invoice.customer);
      const subscriptionId = stripeId(
        subscriptionDetails?.subscription ?? null,
      );
      if (!uid || !customerId || !subscriptionId) return null;
      return {
        id: event.id,
        type: "invoice.paid",
        uid,
        createdAt,
        customerId,
        subscriptionId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        customerEmail: invoice.customer_email,
        customerName: invoice.customer_name,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        invoicePdfUrl: invoice.invoice_pdf ?? null,
      };
    }

    if (
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.upcoming"
    ) {
      const invoice = event.data.object;
      const subscriptionDetails = invoice.parent?.subscription_details;
      const uid = subscriptionDetails?.metadata?.uid;
      const customerId = stripeId(invoice.customer);
      const subscriptionId = stripeId(
        subscriptionDetails?.subscription ?? null,
      );
      if (!uid || !customerId || !subscriptionId) return null;
      return {
        id: event.id,
        type: event.type,
        uid,
        createdAt,
        customerId,
        subscriptionId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        customerEmail: invoice.customer_email,
        customerName: invoice.customer_name,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        nextPaymentAttempt: invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1_000)
          : null,
      };
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const customerId = stripeId(charge.customer);
      if (!customerId || charge.amount_refunded <= 0) return null;
      return {
        id: event.id,
        type: "charge.refunded",
        uid:
          typeof charge.metadata.uid === "string" ? charge.metadata.uid : null,
        createdAt,
        customerId,
        amountRefunded: charge.amount_refunded,
        currency: charge.currency,
        customerEmail: charge.billing_details.email,
        receiptUrl: charge.receipt_url ?? null,
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
