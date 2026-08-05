import { describe, expect, it } from "vitest";

import type { SubscriptionRecord } from "@/types/models";

import {
  getUserEntitlements,
  isWithinLimit,
  resolveEffectivePlan,
} from "./plan-entitlements";

const now = new Date("2026-08-03T12:00:00.000Z");

function subscription(
  overrides: Partial<SubscriptionRecord> = {},
): SubscriptionRecord {
  return {
    plan: "free",
    status: "free",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    billingInterval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialStartedAt: null,
    trialEndsAt: null,
    trialConsumed: false,
    updatedAt: now,
    ...overrides,
  };
}

describe("resolveEffectivePlan", () => {
  it("defaults to free without server-owned subscription state", () => {
    expect(resolveEffectivePlan(null, now)).toBe("free");
  });

  it("grants Plus during an active VistaTeacher trial", () => {
    const record = subscription({
      trialConsumed: true,
      trialStartedAt: new Date("2026-08-01T12:00:00.000Z"),
      trialEndsAt: new Date("2026-08-15T12:00:00.000Z"),
    });

    expect(resolveEffectivePlan(record, now)).toBe("plus");
  });

  it("expires a VistaTeacher trial at its exact end time", () => {
    const record = subscription({
      trialConsumed: true,
      trialEndsAt: now,
    });

    expect(resolveEffectivePlan(record, now)).toBe("free");
  });

  it("does not grant Plus for a past-due Stripe subscription", () => {
    const record = subscription({
      plan: "plus",
      status: "past_due",
      currentPeriodEnd: new Date("2026-09-01T12:00:00.000Z"),
    });

    expect(resolveEffectivePlan(record, now)).toBe("free");
  });
});

describe("entitlement limits", () => {
  it("uses the centralized free limits", () => {
    const entitlements = getUserEntitlements(null, now);

    expect(entitlements.maxConnections).toBe(5);
    expect(entitlements.aiLessonsPerMonth).toBe(3);
    expect(entitlements.aiLessonCreationsPerMonth).toBe(1);
    expect(entitlements.aiRefinementsPerMonth).toBe(2);
    expect(entitlements.lessonExportsPerMonth).toBe(2);
    expect(entitlements.resourceDownloadsPerMonth).toBe(5);
  });

  it("treats null limits as unlimited", () => {
    expect(isWithinLimit(1_000_000, null)).toBe(true);
    expect(isWithinLimit(5, 5)).toBe(false);
    expect(isWithinLimit(4, 5)).toBe(true);
  });
});
