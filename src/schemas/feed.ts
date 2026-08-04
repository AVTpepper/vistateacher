import { z } from "zod";

export const postTypeSchema = z.enum(["post", "question", "resource"]);
export const feedViewSchema = z.enum(["all", "following", "saved"]);

const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} -]*$/u, "Use letters and numbers in tags.");

export const createPostSchema = z.object({
  type: postTypeSchema,
  content: z.string().trim().min(1, "Write something to share.").max(5_000),
  imageURLs: z.array(z.url()).max(4).default([]),
  tags: z.array(tagSchema).max(5).default([]),
  resourceId: z.string().trim().min(1).max(128).nullable().default(null),
});

export const feedQuerySchema = z.object({
  view: feedViewSchema.default("all"),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export const postActionSchema = z.object({
  postId: z.string().trim().min(1).max(128),
});

export const createCommentSchema = postActionSchema.extend({
  content: z.string().trim().min(1, "Write a comment.").max(1_000),
});

export const reportPostSchema = postActionSchema.extend({
  reason: z.enum(["spam", "harassment", "misinformation", "unsafe", "other"]),
  details: z.string().trim().max(500).default(""),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type FeedView = z.infer<typeof feedViewSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type ReportPostInput = z.infer<typeof reportPostSchema>;
