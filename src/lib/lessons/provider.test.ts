import { describe, expect, it } from "vitest";

import { createMockLesson } from "./mock-provider";

describe("lesson provider", () => {
  it("creates schema-valid deterministic lesson content", () => {
    const lesson = createMockLesson({
      subject: "Science",
      gradeLevel: "Grade 6",
      topic: "Local food webs",
      durationMinutes: 50,
      objectives: "Model relationships among organisms.",
      standards: "MS-LS2-3",
      studentNeeds: "Use sentence frames.",
      teachingStyle: "inquiry",
    });

    expect(lesson.durationMinutes).toBe(50);
    expect(
      lesson.warmUp.durationMinutes +
        lesson.mainActivity.durationMinutes +
        lesson.closingActivity.durationMinutes,
    ).toBe(50);
    expect(lesson.standards).toEqual(["MS-LS2-3"]);
  });
});
