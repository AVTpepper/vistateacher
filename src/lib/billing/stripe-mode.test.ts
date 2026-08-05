import { describe, expect, it } from "vitest";

import { resolveStripeMode } from "./stripe-mode";

describe("Stripe mode", () => {
  it("accepts matching test and live secret keys", () => {
    expect(resolveStripeMode("TEST", "sk_test_example")).toBe("TEST");
    expect(resolveStripeMode("LIVE", "sk_live_example")).toBe("LIVE");
  });

  it("defaults to the safer test mode", () => {
    expect(resolveStripeMode(undefined, "sk_test_example")).toBe("TEST");
  });

  it("rejects mode and key mismatches", () => {
    expect(() => resolveStripeMode("LIVE", "sk_test_example")).toThrow(
      "STRIPE_MODE=LIVE requires a sk_live_ key.",
    );
    expect(() => resolveStripeMode("TEST", "sk_live_example")).toThrow(
      "STRIPE_MODE=TEST requires a sk_test_ key.",
    );
  });
});
