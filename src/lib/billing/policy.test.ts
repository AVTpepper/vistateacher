import { describe, expect, it } from "vitest";

import { getTrialEnd, normalizeStripeStatus } from "./policy";

describe("billing policy", () => {
  it("ends the VistaTeacher trial exactly fourteen days after it starts", () => {
    const startedAt = new Date("2026-08-04T15:30:00.000Z");

    expect(getTrialEnd(startedAt).toISOString()).toBe(
      "2026-08-18T15:30:00.000Z",
    );
  });

  it.each([
    ["active", "active"],
    ["trialing", "trialing"],
    ["past_due", "past_due"],
    ["unpaid", "past_due"],
    ["paused", "past_due"],
    ["canceled", "canceled"],
    ["incomplete", "incomplete"],
    ["incomplete_expired", "incomplete"],
  ] as const)("normalizes Stripe %s subscriptions", (input, expected) => {
    expect(normalizeStripeStatus(input)).toBe(expected);
  });

  it("fails closed for future Stripe statuses", () => {
    expect(normalizeStripeStatus("future_status")).toBe("incomplete");
  });
});
