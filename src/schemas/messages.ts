import { z } from "zod";

const documentIdSchema = z.string().trim().min(1).max(128);

export const messageReportReasonSchema = z.enum([
  "spam",
  "harassment",
  "misinformation",
  "unsafe",
  "other",
]);

export const messageAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(160),
  fileType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
});

export const startConversationSchema = z.object({
  recipientId: documentIdSchema,
  content: z.string().trim().min(1).max(5_000),
});

export const sendMessageSchema = z
  .object({
    conversationId: documentIdSchema,
    content: z.string().trim().max(5_000).default(""),
    attachmentId: documentIdSchema.nullable().default(null),
  })
  .refine((value) => value.content.length > 0 || value.attachmentId !== null, {
    message: "A message needs text or an attachment.",
    path: ["content"],
  });

export const reserveMessageAttachmentSchema = z.object({
  conversationId: documentIdSchema,
  attachment: messageAttachmentSchema,
});

export const messageQuerySchema = z.object({
  conversationId: documentIdSchema,
  cursor: z.string().trim().min(1).max(512).optional(),
});

export const conversationActionSchema = z.object({
  conversationId: documentIdSchema,
});

export const messageActionSchema = conversationActionSchema.extend({
  messageId: documentIdSchema,
});

export const editMessageSchema = messageActionSchema.extend({
  content: z.string().trim().min(1).max(5_000),
});

export const messageReportSchema = messageActionSchema.extend({
  reason: messageReportReasonSchema,
  details: z.string().trim().max(500).default(""),
});

export const blockUserSchema = z.object({
  blockedUid: documentIdSchema,
  blocked: z.boolean(),
});

export const notificationQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(512).optional(),
});

export const notificationReadSchema = z.object({
  notificationId: documentIdSchema.nullable().default(null),
});

export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ReserveMessageAttachmentInput = z.infer<
  typeof reserveMessageAttachmentSchema
>;
export type MessageQuery = z.infer<typeof messageQuerySchema>;
export type MessageReportInput = z.infer<typeof messageReportSchema>;
export type BlockUserInput = z.infer<typeof blockUserSchema>;
