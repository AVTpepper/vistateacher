import { z } from "zod";

export const billingIntervalSchema = z.enum(["month", "year"]);
export const checkoutSessionIdSchema = z
  .string()
  .trim()
  .min(10)
  .max(255)
  .startsWith("cs_");

export const checkoutRequestSchema = z.object({
  interval: billingIntervalSchema,
});

export type BillingInterval = z.infer<typeof billingIntervalSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
