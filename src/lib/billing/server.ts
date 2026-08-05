import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getTrialEnd } from "@/lib/billing/policy";
import type {
  BillingProvider,
  NormalizedBillingEvent,
} from "@/lib/billing/provider";
import { getBillingProvider } from "@/lib/billing/stripe-provider";
import { resolveEffectivePlan } from "@/lib/entitlements/plan-entitlements";
import { adminDb } from "@/lib/firebase/admin";
import type { BillingInterval } from "@/schemas/billing";
import type { SubscriptionRecord, SubscriptionStatus } from "@/types/models";

type BillingErrorCode =
  | "account-unavailable"
  | "already-subscribed"
  | "customer-unavailable"
  | "subscription-unavailable"
  | "trial-unavailable";

export class BillingError extends Error {
  constructor(public readonly code: BillingErrorCode) {
    super(code);
  }
}

export interface BillingState {
  effectivePlan: "free" | "plus";
  lifecycle:
    | "free"
    | "vista_trial"
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "incomplete";
  billingInterval: BillingInterval | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
  canStartTrial: boolean;
  canCheckout: boolean;
  canManageBilling: boolean;
}

function date(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function readSubscription(
  data: FirebaseFirestore.DocumentData,
): SubscriptionRecord {
  const statusValues: SubscriptionStatus[] = [
    "free",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "incomplete",
  ];
  const status = statusValues.includes(data.status) ? data.status : "free";
  return {
    plan: data.plan === "plus" ? "plus" : "free",
    status,
    stripeCustomerId:
      typeof data.stripeCustomerId === "string" ? data.stripeCustomerId : null,
    stripeSubscriptionId:
      typeof data.stripeSubscriptionId === "string"
        ? data.stripeSubscriptionId
        : null,
    stripePriceId:
      typeof data.stripePriceId === "string" ? data.stripePriceId : null,
    billingInterval:
      data.billingInterval === "month" || data.billingInterval === "year"
        ? data.billingInterval
        : null,
    currentPeriodEnd: date(data.currentPeriodEnd),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
    trialStartedAt: date(data.trialStartedAt),
    trialEndsAt: date(data.trialEndsAt),
    trialConsumed: data.trialConsumed === true,
    updatedAt: date(data.updatedAt) ?? new Date(0),
  };
}

function billingState(
  subscription: SubscriptionRecord,
  now: Date,
): BillingState {
  const trialActive =
    subscription.trialConsumed &&
    subscription.trialEndsAt !== null &&
    subscription.trialEndsAt > now;
  const stripeActive =
    subscription.plan === "plus" &&
    (subscription.status === "active" || subscription.status === "trialing");
  const lifecycle = trialActive
    ? "vista_trial"
    : subscription.stripeSubscriptionId
      ? subscription.status
      : "free";

  return {
    effectivePlan: resolveEffectivePlan(subscription, now),
    lifecycle,
    billingInterval: subscription.billingInterval,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    trialEndsAt: subscription.trialEndsAt,
    canStartTrial: false,
    canCheckout: !stripeActive,
    canManageBilling: subscription.stripeCustomerId !== null,
  };
}

export async function getBillingState(
  uid: string,
  now = new Date(),
): Promise<BillingState> {
  const snapshot = await adminDb().doc(`subscriptions/${uid}`).get();
  if (!snapshot.exists) throw new BillingError("subscription-unavailable");
  return billingState(readSubscription(snapshot.data() ?? {}), now);
}

export async function startVistaTrial(
  uid: string,
  now = new Date(),
): Promise<BillingState> {
  const db = adminDb();
  const subscription = await db.runTransaction(async (transaction) => {
    const profileRef = db.doc(`users/${uid}`);
    const subscriptionRef = db.doc(`subscriptions/${uid}`);
    const [profileSnapshot, subscriptionSnapshot] = await transaction.getAll(
      profileRef,
      subscriptionRef,
    );
    if (profileSnapshot.data()?.status !== "active")
      throw new BillingError("account-unavailable");
    if (!subscriptionSnapshot.exists)
      throw new BillingError("subscription-unavailable");

    const current = readSubscription(subscriptionSnapshot.data() ?? {});
    if (current.trialConsumed || current.stripeSubscriptionId !== null) {
      throw new BillingError("trial-unavailable");
    }

    const trialEndsAt = getTrialEnd(now);
    transaction.update(subscriptionRef, {
      trialConsumed: true,
      trialStartedAt: Timestamp.fromDate(now),
      trialEndsAt: Timestamp.fromDate(trialEndsAt),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      ...current,
      trialConsumed: true,
      trialStartedAt: now,
      trialEndsAt,
      updatedAt: now,
    };
  });
  return billingState(subscription, now);
}

export async function createCheckout(
  uid: string,
  email: string,
  interval: BillingInterval,
  origin: string,
  provider: BillingProvider = getBillingProvider(),
): Promise<string> {
  const db = adminDb();
  const snapshot = await db.doc(`subscriptions/${uid}`).get();
  if (!snapshot.exists) throw new BillingError("subscription-unavailable");
  const subscription = readSubscription(snapshot.data() ?? {});
  if (
    subscription.plan === "plus" &&
    (subscription.status === "active" || subscription.status === "trialing")
  ) {
    throw new BillingError("already-subscribed");
  }
  return provider.createCheckoutSession({
    uid,
    email,
    interval,
    customerId: subscription.stripeCustomerId,
    origin,
  });
}

export async function createPortal(
  uid: string,
  origin: string,
  provider: BillingProvider = getBillingProvider(),
): Promise<string> {
  const snapshot = await adminDb().doc(`subscriptions/${uid}`).get();
  if (!snapshot.exists) throw new BillingError("subscription-unavailable");
  const customerId = readSubscription(snapshot.data() ?? {}).stripeCustomerId;
  if (!customerId) throw new BillingError("customer-unavailable");
  return provider.createPortalSession({ customerId, origin });
}

export async function reconcileBillingEvent(
  event: NormalizedBillingEvent,
): Promise<boolean> {
  const db = adminDb();
  return db.runTransaction(async (transaction) => {
    const eventRef = db.doc(`billingEvents/${event.id}`);
    const subscriptionRef = db.doc(`subscriptions/${event.uid}`);
    const [eventSnapshot, subscriptionSnapshot] = await transaction.getAll(
      eventRef,
      subscriptionRef,
    );
    if (eventSnapshot.exists) return false;
    if (!subscriptionSnapshot.exists)
      throw new BillingError("subscription-unavailable");

    const priorEventAt = date(
      subscriptionSnapshot.data()?.stripeEventCreatedAt,
    );
    const applied = !priorEventAt || priorEventAt <= event.createdAt;
    if (event.type === "checkout.completed" && applied) {
      const prior = readSubscription(subscriptionSnapshot.data() ?? {});
      transaction.update(subscriptionRef, {
        plan: "plus",
        status: "active",
        stripeCustomerId: event.customerId,
        stripeSubscriptionId: event.subscriptionId,
        billingInterval: event.interval ?? prior.billingInterval,
        cancelAtPeriodEnd: false,
        stripeEventCreatedAt: Timestamp.fromDate(event.createdAt),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (event.type === "subscription.updated" && applied) {
      transaction.update(subscriptionRef, {
        plan: "plus",
        status: event.status,
        stripeCustomerId: event.customerId,
        stripeSubscriptionId: event.subscriptionId,
        stripePriceId: event.priceId,
        billingInterval: event.interval,
        currentPeriodEnd: event.currentPeriodEnd
          ? Timestamp.fromDate(event.currentPeriodEnd)
          : null,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd,
        stripeEventCreatedAt: Timestamp.fromDate(event.createdAt),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    transaction.create(eventRef, {
      type: event.type,
      uid: event.uid,
      stripeCreatedAt: Timestamp.fromDate(event.createdAt),
      applied,
      processedAt: FieldValue.serverTimestamp(),
    });
    return applied;
  });
}
