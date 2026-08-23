import { z } from "zod";

import { resourceTypeSchema } from "@/schemas/resource";

export const creationDraftTypeSchema = z.enum(["forum", "resource", "message"]);

const mentionSchema = z.object({
  uid: z.string().trim().min(1).max(128),
  displayName: z.string().trim().min(1).max(160),
});

export const forumCreationDraftSchema = z.object({
  categoryId: z.string().max(80),
  title: z.string().max(180),
  content: z.string().max(10_000),
  tags: z.string().max(180),
  mentions: z.array(mentionSchema).max(10),
});

export const resourceCreationDraftSchema = z.object({
  title: z.string().max(140),
  description: z.string().max(2_000),
  type: resourceTypeSchema,
  subject: z.string().max(60),
  gradeLevel: z.string().max(60),
  tags: z.string().max(240),
  accessTier: z.literal("free"),
  draftResourceId: z.string().max(128).nullable(),
});

export const messageCreationDraftSchema = z.object({
  recipient: z
    .object({
      uid: z.string().trim().min(1).max(128),
      displayName: z.string().trim().min(1).max(160),
      photoURL: z.string().url().nullable(),
      gradeLevel: z.string().max(120),
      subjects: z.array(z.string().max(120)).max(30),
      school: z.string().max(180),
      city: z.string().max(160),
      isVerified: z.boolean(),
    })
    .nullable(),
  content: z.string().max(5_000),
});

export const creationDraftSchemas = {
  forum: forumCreationDraftSchema,
  resource: resourceCreationDraftSchema,
  message: messageCreationDraftSchema,
};

export type CreationDraftType = z.infer<typeof creationDraftTypeSchema>;
export type ForumCreationDraft = z.infer<typeof forumCreationDraftSchema>;
export type ResourceCreationDraft = z.infer<typeof resourceCreationDraftSchema>;
export type MessageCreationDraft = z.infer<typeof messageCreationDraftSchema>;

export interface CreationDraftMap {
  forum: ForumCreationDraft;
  resource: ResourceCreationDraft;
  message: MessageCreationDraft;
}
