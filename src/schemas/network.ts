import { z } from "zod";

export const discoveryFiltersSchema = z.object({
  query: z.string().trim().max(80).default(""),
  subject: z.string().trim().max(40).default(""),
  grade: z.string().trim().max(50).default(""),
  location: z.string().trim().max(80).default(""),
  verified: z.boolean().default(false),
});

export const followActionSchema = z.object({
  targetUid: z.string().trim().min(1).max(128),
});

export type DiscoveryFilters = z.infer<typeof discoveryFiltersSchema>;
