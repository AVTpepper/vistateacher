import { describe, expect, it } from "vitest";

import { feedbackSchema } from "@/schemas/feedback";

const validFeedback = {
  name: "Alex Teacher",
  email: "alex@example.com",
  category: "feedback",
  message: "I would like to suggest a new collaboration feature.",
  website: "",
};

describe("feedback schema", () => {
  it("accepts a bounded feedback submission", () => {
    expect(feedbackSchema.parse(validFeedback)).toEqual(validFeedback);
  });

  it("rejects short messages and honeypot submissions", () => {
    expect(
      feedbackSchema.safeParse({ ...validFeedback, message: "Too short" })
        .success,
    ).toBe(false);
    expect(
      feedbackSchema.safeParse({ ...validFeedback, website: "spam.example" })
        .success,
    ).toBe(false);
  });
});
