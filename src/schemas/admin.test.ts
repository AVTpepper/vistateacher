import { describe, expect, it } from "vitest";

import { adminActionSchema } from "./admin";

describe("adminActionSchema", () => {
  it("accepts bounded moderation actions", () => {
    expect(
      adminActionSchema.safeParse({
        action: "content.moderate",
        targetType: "forumReply",
        targetId: "reply-one",
        parentId: "thread-one",
        status: "rejected",
        reason: "Violates the community guidelines.",
      }).success,
    ).toBe(true);
  });

  it("rejects unsupported destructive actions and empty reasons", () => {
    expect(
      adminActionSchema.safeParse({
        action: "user.delete",
        targetId: "educator-one",
        reason: "Requested",
      }).success,
    ).toBe(false);
    expect(
      adminActionSchema.safeParse({
        action: "report.resolve",
        targetId: "report-one",
        resolution: "resolved",
        reason: "",
      }).success,
    ).toBe(false);
  });
});
