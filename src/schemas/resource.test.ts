import { describe, expect, it } from "vitest";

import {
  reserveResourceSchema,
  resourceReviewSchema,
} from "@/schemas/resource";

const valid = {
  title: "Fraction comparison cards",
  description: "A classroom-ready card activity for comparing fractions.",
  type: "activity",
  subject: "Mathematics",
  gradeLevel: "Grades 3-5",
  tags: ["Fractions"],
  accessTier: "free",
  fileName: "fraction-cards.pdf",
  fileType: "application/pdf",
  fileSize: 1024,
};

describe("resource schemas", () => {
  it("accepts safe bounded metadata", () => {
    expect(reserveResourceSchema.safeParse(valid).success).toBe(true);
    expect(
      reserveResourceSchema.safeParse({
        ...valid,
        fileName: "classroom.heic",
        fileType: "image/heic",
      }).success,
    ).toBe(true);
    expect(
      reserveResourceSchema.safeParse({
        ...valid,
        fileName: "lesson.ppt",
        fileType: "application/vnd.ms-powerpoint",
      }).success,
    ).toBe(true);
  });

  it("rejects executable files and files over 25 MB", () => {
    expect(
      reserveResourceSchema.safeParse({
        ...valid,
        fileType: "application/javascript",
      }).success,
    ).toBe(false);
    expect(
      reserveResourceSchema.safeParse({
        ...valid,
        fileSize: 25 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
  });

  it("requires a one-to-five star review with useful text", () => {
    expect(
      resourceReviewSchema.safeParse({
        resourceId: "one",
        rating: 5,
        review: "Useful tomorrow.",
      }).success,
    ).toBe(true);
    expect(
      resourceReviewSchema.safeParse({
        resourceId: "one",
        rating: 6,
        review: "No",
      }).success,
    ).toBe(false);
  });
});
