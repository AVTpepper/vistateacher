import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getTrialEnd } from "@/lib/billing/policy";
import type {
  BillingCommunicationKind,
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
  | "billing-unavailable"
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
    | "unpaid"
    | "paused"
    | "canceled"
    | "incomplete"
    | "incomplete_expired";
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
    "unpaid",
    "paused",
    "canceled",
    "incomplete",
    "incomplete_expired",
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
  const blocksCheckout =
    subscription.plan === "plus" &&
    [
      "active",
      "trialing",
      "past_due",
      "unpaid",
      "paused",
      "incomplete",
    ].includes(subscription.status);
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
    canCheckout: !blocksCheckout,
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
    subscription.stripeSubscriptionId &&
    !["canceled", "incomplete_expired"].includes(subscription.status)
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

export async function updateSubscriptionCancellation(
  uid: string,
  cancelAtPeriodEnd: boolean,
  provider: BillingProvider = getBillingProvider(),
): Promise<void> {
  const db = adminDb();
  const subscriptionRef = db.doc(`subscriptions/${uid}`);
  const snapshot = await subscriptionRef.get();
  if (!snapshot.exists) throw new BillingError("subscription-unavailable");

  const current = readSubscription(snapshot.data() ?? {});
  if (!current.stripeSubscriptionId || !current.stripeCustomerId) {
    throw new BillingError("billing-unavailable");
  }
  await provider.updateSubscriptionCancellation({
    subscriptionId: current.stripeSubscriptionId,
    cancelAtPeriodEnd,
  });

  await subscriptionRef.update({
    cancelAtPeriodEnd,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function confirmCompletedCheckout(
  uid: string,
  sessionId: string,
  provider: BillingProvider = getBillingProvider(),
): Promise<boolean> {
  const event = await provider.retrieveCompletedCheckout(sessionId, uid);
  if (!event) return false;
  await reconcileBillingEvent(event);
  return true;
}

export interface BillingReconciliationResult {
  applied: boolean;
  communicationKind: BillingCommunicationKind | null;
  uid: string | null;
}

function communicationForSubscriptionChange(
  prior: SubscriptionRecord,
  event: Extract<NormalizedBillingEvent, { type: "subscription.updated" }>,
): BillingCommunicationKind | null {
  if (event.status === "canceled" && prior.status !== "canceled")
    return "subscription-ended";
  if (event.cancelAtPeriodEnd && !prior.cancelAtPeriodEnd)
    return "cancellation-scheduled";
  if (!event.cancelAtPeriodEnd && prior.cancelAtPeriodEnd)
    return "renewal-restored";
  return null;
}

function directCommunication(
  event: NormalizedBillingEvent,
): BillingCommunicationKind | null {
  if (event.type === "invoice.paid" && event.amountPaid > 0)
    return "payment-receipt";
  if (event.type === "invoice.payment_failed") return "payment-failed";
  if (event.type === "invoice.upcoming") return "renewal-upcoming";
  if (event.type === "charge.refunded") return "refund-issued";
  return null;
}

const BILLING_NOTIFICATION_COPY: Record<BillingCommunicationKind, string> = {
  "payment-receipt": "Your VistaTeacher Plus payment was received.",
  "payment-failed":
    "Your VistaTeacher Plus payment needs attention. Update your payment method.",
  "renewal-upcoming": "Your VistaTeacher Plus renewal is coming up.",
  "cancellation-scheduled":
    "Your VistaTeacher Plus cancellation has been scheduled.",
  "renewal-restored": "Automatic renewal for VistaTeacher Plus was restored.",
  "subscription-ended": "Your VistaTeacher Plus membership has ended.",
  "refund-issued": "A refund was issued for your VistaTeacher payment.",
};

async function resolveBillingEventUid(
  event: NormalizedBillingEvent,
): Promise<string | null> {
  if (event.uid) return event.uid;
  const matches = await adminDb()
    .collection("subscriptions")
    .where("stripeCustomerId", "==", event.customerId)
    .limit(1)
    .get();
  return matches.docs[0]?.id ?? null;
}

export async function reconcileBillingEvent(
  event: NormalizedBillingEvent,
): Promise<BillingReconciliationResult> {
  const db = adminDb();
  const uid = await resolveBillingEventUid(event);
  if (!uid) return { applied: false, communicationKind: null, uid: null };
  return db.runTransaction(async (transaction) => {
    const eventRef = db.doc(`billingEvents/${event.id}`);
    const subscriptionRef = db.doc(`subscriptions/${uid}`);
    const [eventSnapshot, subscriptionSnapshot] = await transaction.getAll(
      eventRef,
      subscriptionRef,
    );
    if (eventSnapshot.exists) {
      const communicationKind = eventSnapshot.data()
        ?.communicationKind as BillingCommunicationKind | null;
      return {
        applied: false,
        communicationKind: communicationKind ?? null,
        uid,
      };
    }
    if (!subscriptionSnapshot.exists)
      throw new BillingError("subscription-unavailable");

    const priorEventAt = date(
      subscriptionSnapshot.data()?.stripeEventCreatedAt,
    );
    const applied =
      event.type === "invoice.paid" ||
      !priorEventAt ||
      priorEventAt <= event.createdAt;
    const prior = readSubscription(subscriptionSnapshot.data() ?? {});
    let communicationKind = directCommunication(event);
    if (event.type === "checkout.completed" && applied) {
      transaction.update(subscriptionRef, {
        plan: "plus",
        status: "incomplete",
        stripeCustomerId: event.customerId,
        stripeSubscriptionId: event.subscriptionId,
        billingInterval: event.interval ?? prior.billingInterval,
        cancelAtPeriodEnd: false,
        stripeEventCreatedAt: Timestamp.fromDate(event.createdAt),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (event.type === "subscription.updated" && applied) {
      communicationKind = communicationForSubscriptionChange(prior, event);
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
      uid,
      communicationKind,
      ...(communicationKind
        ? {
            emailSentAt: null,
            emailAttemptedAt: null,
            emailError: null,
          }
        : {}),
      stripeCreatedAt: Timestamp.fromDate(event.createdAt),
      applied,
      processedAt: FieldValue.serverTimestamp(),
    });
    if (communicationKind) {
      transaction.set(db.doc(`users/${uid}/notifications/${event.id}`), {
        type: `billing-${communicationKind}`,
        actorId: null,
        actorName: "VistaTeacher",
        entityId: event.id,
        message: BILLING_NOTIFICATION_COPY[communicationKind],
        href: "/settings/billing",
        read: false,
        archived: false,
        createdAt: Timestamp.fromDate(event.createdAt),
      });
    }
    return { applied, communicationKind, uid };
  });
}
