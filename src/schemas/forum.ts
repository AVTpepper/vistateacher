import { z } from "zod";

const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} -]*$/u, "Use letters and numbers in tags.");

export const forumReportReasonSchema = z.enum([
  "spam",
  "harassment",
  "misinformation",
  "unsafe",
  "other",
]);

export const createForumThreadSchema = z.object({
  categoryId: z.string().trim().min(1).max(80),
  title: z.string().trim().min(8).max(180),
  content: z.string().trim().min(20).max(10_000),
  tags: z.array(tagSchema).max(5).default([]),
});

export const createForumReplySchema = z.object({
  threadId: z.string().trim().min(1).max(128),
  content: z.string().trim().min(3).max(5_000),
});

export const forumQuerySchema = z.object({
  categoryId: z.string().trim().max(80).default(""),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export const forumThreadActionSchema = z.object({
  threadId: z.string().trim().min(1).max(128),
});

export const forumReplyActionSchema = forumThreadActionSchema.extend({
  replyId: z.string().trim().min(1).max(128),
});

export const forumLikeSchema = forumThreadActionSchema.extend({
  replyId: z.string().trim().min(1).max(128).nullable().default(null),
  liked: z.boolean(),
});

export const forumReportSchema = forumThreadActionSchema.extend({
  replyId: z.string().trim().min(1).max(128).nullable().default(null),
  reason: forumReportReasonSchema,
  details: z.string().trim().max(500).default(""),
});

export const forumModerationSchema = forumThreadActionSchema.extend({
  action: z.enum(["pin", "unpin", "lock", "unlock", "delete"]),
});

export type CreateForumThreadInput = z.infer<typeof createForumThreadSchema>;
export type CreateForumReplyInput = z.infer<typeof createForumReplySchema>;
export type ForumQuery = z.infer<typeof forumQuerySchema>;
export type ForumReportInput = z.infer<typeof forumReportSchema>;
export type ForumModerationInput = z.infer<typeof forumModerationSchema>;
