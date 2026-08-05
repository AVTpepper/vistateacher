import { describe, expect, it } from "vitest";

import { resolveStripeMode, resolveStripePublishableKey } from "./stripe-mode";

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

  it("requires a publishable key from the configured mode", () => {
    expect(resolveStripePublishableKey("TEST", "pk_test_example")).toBe(
      "pk_test_example",
    );
    expect(() =>
      resolveStripePublishableKey("LIVE", "pk_test_example"),
    ).toThrow("STRIPE_MODE=LIVE requires a pk_live_ key.");
  });
});
