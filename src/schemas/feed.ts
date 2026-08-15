import { z } from "zod";

import {
  isHttpURL,
  POST_FILE_MAX_SIZE,
  POST_FILE_MIME_TYPES,
} from "@/lib/feed/attachments";

export const postTypeSchema = z.enum(["post", "question", "resource"]);
export const feedViewSchema = z.enum(["all", "following", "saved"]);

const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} -]*$/u, "Use letters and numbers in tags.");

const mentionUidsSchema = z
  .array(z.string().trim().min(1).max(128))
  .max(10)
  .optional();

const httpURLSchema = z
  .url()
  .max(2_048)
  .refine(isHttpURL, "Use an HTTP or HTTPS link.");

export const postFileAttachmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .refine(
      (name) => !/[\\/\u0000-\u001f]/u.test(name),
      "Use a valid file name.",
    ),
  url: httpURLSchema,
  contentType: z.enum(POST_FILE_MIME_TYPES),
  size: z.number().int().nonnegative().max(POST_FILE_MAX_SIZE),
});

export const createPostSchema = z.object({
  type: postTypeSchema,
  content: z.string().trim().min(1, "Write something to share.").max(5_000),
  imageURLs: z.array(httpURLSchema).max(4).default([]),
  fileAttachments: z.array(postFileAttachmentSchema).max(4).default([]),
  linkURLs: z.array(httpURLSchema).max(3).default([]),
  tags: z.array(tagSchema).max(5).default([]),
  resourceId: z.string().trim().min(1).max(128).nullable().default(null),
  mentionUids: mentionUidsSchema,
});

export const updatePostSchema = createPostSchema
  .omit({
    resourceId: true,
  })
  .extend({
    postId: z.string().trim().min(1).max(128),
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
  mentionUids: mentionUidsSchema,
});

export const commentActionSchema = postActionSchema.extend({
  commentId: z.string().trim().min(1).max(128),
});

export const updateCommentSchema = commentActionSchema.extend({
  content: z.string().trim().min(1, "Write a comment.").max(1_000),
});

export const reportPostSchema = postActionSchema.extend({
  reason: z.enum(["spam", "harassment", "misinformation", "unsafe", "other"]),
  details: z.string().trim().max(500).default(""),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type PostFileAttachment = z.infer<typeof postFileAttachmentSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type FeedView = z.infer<typeof feedViewSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type ReportPostInput = z.infer<typeof reportPostSchema>;
