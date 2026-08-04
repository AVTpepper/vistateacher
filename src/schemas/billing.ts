import { z } from "zod";

export const billingIntervalSchema = z.enum(["month", "year"]);

export const checkoutRequestSchema = z.object({
  interval: billingIntervalSchema,
});

export type BillingInterval = z.infer<typeof billingIntervalSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
