import { z } from "zod";

export const resourceTypeSchema = z.enum([
  "lesson-plan",
  "worksheet",
  "unit-plan",
  "video",
  "activity",
]);
export const resourceAccessSchema = z.enum(["free", "plus"]);
export const resourceMimeTypeSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
]);

export const resourceMetadataSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(10).max(2_000),
  type: resourceTypeSchema,
  subject: z.string().trim().min(2).max(60),
  gradeLevel: z.string().trim().min(2).max(60),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  accessTier: resourceAccessSchema,
});

export const reserveResourceSchema = resourceMetadataSchema.extend({
  fileName: z.string().trim().min(1).max(180),
  fileType: resourceMimeTypeSchema,
  fileSize: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
});

export const resourceActionSchema = z.object({
  resourceId: z.string().trim().min(1).max(128),
});

export const resourceQuerySchema = z.object({
  query: z.string().trim().max(100).default(""),
  type: z.union([resourceTypeSchema, z.literal("")]).default(""),
  subject: z.string().trim().max(60).default(""),
  sort: z
    .enum(["newest", "downloads", "rating", "reviews"])
    .default("downloads"),
});

export const resourceReviewSchema = resourceActionSchema.extend({
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().min(3).max(1_000),
});

export const updateResourceSchema = resourceMetadataSchema.extend({
  resourceId: z.string().trim().min(1).max(128),
});

export const resourceReviewActionSchema = resourceActionSchema;

export type ReserveResourceInput = z.infer<typeof reserveResourceSchema>;
export type ResourceQuery = z.infer<typeof resourceQuerySchema>;
export type ResourceReviewInput = z.infer<typeof resourceReviewSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type ResourceType = z.infer<typeof resourceTypeSchema>;
export type ResourceAccess = z.infer<typeof resourceAccessSchema>;
