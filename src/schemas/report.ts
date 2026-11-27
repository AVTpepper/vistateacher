import { z } from "zod";

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "misinformation",
  "unsafe",
  "other",
] as const;

export const REPORT_REASON_LABELS: Record<
  (typeof REPORT_REASONS)[number],
  string
> = {
  spam: "Spam",
  harassment: "Harassment",
  misinformation: "Misinformation",
  unsafe: "Unsafe content",
  other: "Other",
};

export const reportDetailsSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).default(""),
});

export const resourceReportSchema = reportDetailsSchema.extend({
  resourceId: z.string().regex(/^[\w-]{1,128}$/),
});

export type ReportDetails = z.infer<typeof reportDetailsSchema>;
