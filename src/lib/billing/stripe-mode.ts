import { z } from "zod";

export const stripeModeSchema = z.enum(["TEST", "LIVE"]);

export type StripeMode = z.infer<typeof stripeModeSchema>;

export function resolveStripeMode(
  value: string | undefined,
  secretKey: string | undefined,
): StripeMode {
  const mode = stripeModeSchema.parse(value ?? "TEST");
  const expectedPrefix = mode === "TEST" ? "sk_test_" : "sk_live_";

  if (!secretKey?.startsWith(expectedPrefix)) {
    throw new Error(`STRIPE_MODE=${mode} requires a ${expectedPrefix} key.`);
  }

  return mode;
}
