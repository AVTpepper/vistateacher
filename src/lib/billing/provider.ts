import type { BillingInterval } from "@/schemas/billing";
import type { SubscriptionStatus } from "@/types/models";

export interface CheckoutSessionInput {
  uid: string;
  email: string;
  interval: BillingInterval;
  customerId: string | null;
  origin: string;
}

export interface PortalSessionInput {
  customerId: string;
  origin: string;
}

export interface SubscriptionCancellationInput {
  subscriptionId: string;
  cancelAtPeriodEnd: boolean;
}

export type NormalizedBillingEvent =
  | {
      id: string;
      type: "checkout.completed";
      uid: string;
      createdAt: Date;
      customerId: string;
      subscriptionId: string;
      interval: BillingInterval | null;
    }
  | {
      id: string;
      type: "subscription.updated";
      uid: string;
      createdAt: Date;
      customerId: string;
      subscriptionId: string;
      priceId: string;
      interval: BillingInterval;
      status: SubscriptionStatus;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
    }
  | {
      id: string;
      type: "invoice.paid";
      uid: string;
      createdAt: Date;
      customerId: string;
      subscriptionId: string;
      invoiceId: string;
      invoiceNumber: string | null;
      customerEmail: string | null;
      customerName: string | null;
      amountPaid: number;
      currency: string;
      hostedInvoiceUrl: string | null;
      invoicePdfUrl: string | null;
    };

export interface BillingProvider {
  createCheckoutSession(input: CheckoutSessionInput): Promise<string>;
  retrieveCompletedCheckout(
    sessionId: string,
    expectedUid: string,
  ): Promise<NormalizedBillingEvent | null>;
  createPortalSession(input: PortalSessionInput): Promise<string>;
  updateSubscriptionCancellation(
    input: SubscriptionCancellationInput,
  ): Promise<void>;
  constructWebhookEvent(
    body: string,
    signature: string,
  ): NormalizedBillingEvent | null;
}
