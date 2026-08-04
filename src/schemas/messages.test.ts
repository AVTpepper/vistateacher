import { describe, expect, it } from "vitest";

import {
  blockUserSchema,
  messageAttachmentSchema,
  messageReportSchema,
  sendMessageSchema,
  startConversationSchema,
} from "@/schemas/messages";

describe("messaging schemas", () => {
  it("accepts bounded conversation and message input", () => {
    expect(
      startConversationSchema.safeParse({
        recipientId: "educator-two",
        content: "Would you like to compare our discussion routines?",
      }).success,
    ).toBe(true);
    expect(
      sendMessageSchema.safeParse({
        conversationId: "educator-one_educator-two",
        content: "I can share mine tomorrow.",
      }).success,
    ).toBe(true);
  });

  it("requires text or a reserved attachment", () => {
    expect(
      sendMessageSchema.safeParse({
        conversationId: "educator-one_educator-two",
        content: "   ",
      }).success,
    ).toBe(false);
    expect(
      sendMessageSchema.safeParse({
        conversationId: "educator-one_educator-two",
        attachmentId: "attachment-one",
      }).success,
    ).toBe(true);
  });

  it("bounds attachment types and sizes", () => {
    expect(
      messageAttachmentSchema.safeParse({
        fileName: "reflection-routine.pdf",
        fileType: "application/pdf",
        fileSize: 500_000,
      }).success,
    ).toBe(true);
    expect(
      messageAttachmentSchema.safeParse({
        fileName: "archive.zip",
        fileType: "application/zip",
        fileSize: 500_000,
      }).success,
    ).toBe(false);
  });

  it("limits block and report actions to known shapes", () => {
    expect(
      blockUserSchema.safeParse({ blockedUid: "educator-two", blocked: true })
        .success,
    ).toBe(true);
    expect(
      messageReportSchema.safeParse({
        conversationId: "educator-one_educator-two",
        messageId: "message-one",
        reason: "harassment",
        details: "Repeated unwanted contact.",
      }).success,
    ).toBe(true);
    expect(
      messageReportSchema.safeParse({
        conversationId: "educator-one_educator-two",
        messageId: "message-one",
        reason: "unknown",
      }).success,
    ).toBe(false);
  });
});
