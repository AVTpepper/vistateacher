import { describe, expect, it } from "vitest";

import {
  createForumReplySchema,
  createForumThreadSchema,
  forumModerationSchema,
  forumReportSchema,
} from "@/schemas/forum";

describe("forum schemas", () => {
  it("accepts bounded discussion and reply content", () => {
    expect(
      createForumThreadSchema.safeParse({
        categoryId: "student-engagement",
        title: "How do you structure student-led discussion?",
        content:
          "I am looking for routines that make space for every learner to contribute.",
        tags: ["discussion", "student voice"],
      }).success,
    ).toBe(true);
    expect(
      createForumReplySchema.safeParse({
        threadId: "thread-one",
        content: "Silent writing before partner talk has worked well for us.",
      }).success,
    ).toBe(true);
  });

  it("rejects underspecified or oversized discussion input", () => {
    expect(
      createForumThreadSchema.safeParse({
        categoryId: "student-engagement",
        title: "Help",
        content: "Too short.",
        tags: [],
      }).success,
    ).toBe(false);
    expect(
      createForumReplySchema.safeParse({
        threadId: "thread-one",
        content: "x".repeat(5_001),
      }).success,
    ).toBe(false);
  });

  it("limits reports and moderation to known actions", () => {
    expect(
      forumReportSchema.safeParse({
        threadId: "thread-one",
        replyId: null,
        reason: "spam",
        details: "Repeated promotional links.",
      }).success,
    ).toBe(true);
    expect(
      forumModerationSchema.safeParse({
        threadId: "thread-one",
        action: "publish",
      }).success,
    ).toBe(false);
  });
});
