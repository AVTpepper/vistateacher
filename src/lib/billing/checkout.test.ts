// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { createMemoryFirestore } from "../../../tests/memory-firestore";
import { cancelOpenCheckout, createCheckout } from "@/lib/billing/server";
import type {
  BillingProvider,
  CheckoutSessionInput,
} from "@/lib/billing/provider";

const db = createMemoryFirestore();
vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => db }));
vi.mock("@/lib/billing/stripe-provider", () => ({
  getBillingProvider: () => {
    throw new Error("Provider must be explicit in tests");
  },
}));
const sessions = new Map<
  string,
  { id: string; clientSecret: string; expiresAt: number }
>();
const createSession = vi.fn(async (input: CheckoutSessionInput) => {
  if (!sessions.has(input.idempotencyKey))
    sessions.set(input.idempotencyKey, {
      id: `cs_${sessions.size}`,
      clientSecret: `secret_${sessions.size}`,
      expiresAt: input.expiresAt,
    });
  return sessions.get(input.idempotencyKey)!;
});
const expire = vi.fn(async () => true);
const provider = {
  createCheckoutSession: createSession,
  expireOpenCheckout: expire,
  closeCheckoutForDeletion: vi.fn(),
} as unknown as BillingProvider;

describe("durable checkout protection", () => {
  beforeEach(() => {
    db.documents.clear();
    sessions.clear();
    vi.clearAllMocks();
    db.documents.set("users/owner", { status: "active" });
    db.documents.set("subscriptions/owner", { status: "free", plan: "free" });
    expire.mockResolvedValue(true);
  });
  it("blocks a completed payment after local expiry while its webhook is delayed", async () => {
    await createCheckout(
      "owner",
      "owner@example.com",
      "month",
      "https://vista.test",
      provider,
    );
    db.documents.get("checkoutSessions/owner")!.expiresAt =
      Timestamp.fromMillis(Date.now() - 1000);
    expire.mockResolvedValueOnce(false);
    await expect(
      createCheckout(
        "owner",
        "owner@example.com",
        "year",
        "https://vista.test",
        provider,
      ),
    ).rejects.toThrow("already-subscribed");
    expect(sessions.size).toBe(1);
  });
  it("replaces an unconfirmed reservation when it no longer meets Stripe's minimum expiry", async () => {
    createSession.mockRejectedValueOnce(new Error("connection interrupted"));
    await expect(
      createCheckout(
        "owner",
        "owner@example.com",
        "month",
        "https://vista.test",
        provider,
      ),
    ).rejects.toThrow("connection interrupted");
    const firstKey = db.documents.get("checkoutSessions/owner")!.key;
    db.documents.get("checkoutSessions/owner")!.expiresAt =
      Timestamp.fromMillis(Date.now() + 29 * 60_000);
    await createCheckout(
      "owner",
      "owner@example.com",
      "month",
      "https://vista.test",
      provider,
    );
    expect(db.documents.get("checkoutSessions/owner")!.key).not.toBe(firstKey);
  });
  it("reuses one Stripe session across simultaneous requests and later reloads", async () => {
    const results = await Promise.all([
      createCheckout(
        "owner",
        "owner@example.com",
        "month",
        "https://vista.test",
        provider,
      ),
      createCheckout(
        "owner",
        "owner@example.com",
        "month",
        "https://vista.test",
        provider,
      ),
    ]);
    expect(results[0]).toBe(results[1]);
    expect(sessions.size).toBe(1);
    const calls = createSession.mock.calls.length;
    expect(
      await createCheckout(
        "owner",
        "owner@example.com",
        "month",
        "https://vista.test",
        provider,
      ),
    ).toBe(results[0]);
    expect(createSession).toHaveBeenCalledTimes(calls);
  });
  it("blocks another interval until the existing checkout is explicitly closed", async () => {
    await createCheckout(
      "owner",
      "owner@example.com",
      "month",
      "https://vista.test",
      provider,
    );
    await expect(
      createCheckout(
        "owner",
        "owner@example.com",
        "year",
        "https://vista.test",
        provider,
      ),
    ).rejects.toThrow("checkout-in-progress");
    await cancelOpenCheckout("owner", provider);
    await createCheckout(
      "owner",
      "owner@example.com",
      "year",
      "https://vista.test",
      provider,
    );
    expect(expire).toHaveBeenCalledTimes(1);
    expect(sessions.size).toBe(2);
  });
  it("keeps the same idempotency key after an interrupted Stripe request", async () => {
    createSession.mockRejectedValueOnce(new Error("connection interrupted"));
    await expect(
      createCheckout(
        "owner",
        "owner@example.com",
        "month",
        "https://vista.test",
        provider,
      ),
    ).rejects.toThrow("connection interrupted");
    await createCheckout(
      "owner",
      "owner@example.com",
      "month",
      "https://vista.test",
      provider,
    );
    expect(createSession.mock.calls[0][0].idempotencyKey).toBe(
      createSession.mock.calls[1][0].idempotencyKey,
    );
  });
  it("does not cancel an already completed payment or allow a second subscription", async () => {
    await createCheckout(
      "owner",
      "owner@example.com",
      "month",
      "https://vista.test",
      provider,
    );
    expire.mockResolvedValueOnce(false);
    await expect(cancelOpenCheckout("owner", provider)).rejects.toThrow(
      "already-subscribed",
    );
    db.documents.set("subscriptions/owner", {
      status: "active",
      stripeSubscriptionId: "sub_one",
    });
    await expect(
      createCheckout(
        "owner",
        "owner@example.com",
        "month",
        "https://vista.test",
        provider,
      ),
    ).rejects.toThrow("already-subscribed");
  });
});
