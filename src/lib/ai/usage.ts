import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import {
  PLAN_ENTITLEMENTS,
  resolveEffectivePlan,
} from "@/lib/entitlements/plan-entitlements";
import type { SubscriptionRecord, SubscriptionStatus } from "@/types/models";

export function usageNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}
export function firestoreDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}
export function firestoreIso(value: unknown): string {
  return (firestoreDate(value) ?? new Date(0)).toISOString();
}
export function usageMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function usageSubscription(
  data: FirebaseFirestore.DocumentData | undefined,
): SubscriptionRecord | null {
  if (!data) return null;
  return {
    plan: data.plan === "plus" ? "plus" : "free",
    status: String(data.status ?? "free") as SubscriptionStatus,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    billingInterval: null,
    currentPeriodEnd: firestoreDate(data.currentPeriodEnd),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
    trialStartedAt: firestoreDate(data.trialStartedAt),
    trialEndsAt: firestoreDate(data.trialEndsAt),
    trialConsumed: data.trialConsumed === true,
    updatedAt: firestoreDate(data.updatedAt) ?? new Date(0),
  };
}
export function aiUsage(
  subscription: FirebaseFirestore.DocumentData | undefined,
  usage: FirebaseFirestore.DocumentData | undefined,
  now = new Date(),
) {
  const plan = resolveEffectivePlan(usageSubscription(subscription), now);
  const used = usageNumber(usage?.aiLessons);
  const limit = PLAN_ENTITLEMENTS[plan].aiLessonsPerMonth;
  return {
    plan,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).toISOString(),
  };
}
export function generationAccessError(
  user: FirebaseFirestore.DocumentData | undefined,
  subscription: FirebaseFirestore.DocumentData | undefined,
  usage: FirebaseFirestore.DocumentData | undefined,
  now = new Date(),
  ignoreCooldown = false,
): "inactive" | "limit-reached" | "rate-limited" | null {
  if (user?.status !== "active") return "inactive";
  if (aiUsage(subscription, usage, now).remaining < 1) return "limit-reached";
  const last = firestoreDate(usage?.lastAiLessonAt);
  if (!ignoreCooldown && last && now.getTime() - last.getTime() < 8_000)
    return "rate-limited";
  return null;
}
