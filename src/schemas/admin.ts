import { z } from "zod";

const documentIdSchema = z.string().trim().min(1).max(128);
const reasonSchema = z.string().trim().min(3).max(500);

export const adminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("user.status"),
    targetId: documentIdSchema,
    status: z.enum(["active", "suspended"]),
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal("content.moderate"),
    targetType: z.enum(["post", "resource", "forumThread", "forumReply"]),
    targetId: documentIdSchema,
    parentId: documentIdSchema.nullable().default(null),
    status: z.enum(["approved", "rejected"]),
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal("report.resolve"),
    targetId: documentIdSchema,
    resolution: z.enum(["resolved", "dismissed"]),
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal("verification.decide"),
    targetId: documentIdSchema,
    decision: z.enum(["approved", "rejected"]),
    reason: reasonSchema,
  }),
]);

export type AdminAction = z.infer<typeof adminActionSchema>;
