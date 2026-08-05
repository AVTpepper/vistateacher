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
    };

export interface BillingProvider {
  createCheckoutSession(input: CheckoutSessionInput): Promise<string>;
  createPortalSession(input: PortalSessionInput): Promise<string>;
  constructWebhookEvent(
    body: string,
    signature: string,
  ): NormalizedBillingEvent | null;
}
