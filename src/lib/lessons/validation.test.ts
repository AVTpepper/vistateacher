import { describe, expect, it } from "vitest";
import { createMockLesson } from "./mock-provider";
import { validateGeneratedLesson } from "./validation";
import { lessonSourceSchema } from "@/schemas/lesson";

const source = lessonSourceSchema.parse({
  subject: "Swedish",
  gradeLevel: "Ages 10–12",
  topic: "Local stories",
  durationMinutes: 60,
  teachingStyle: "balanced",
});

describe("generated lesson quality gates", () => {
  it("rejects a structurally valid lesson with incorrect timing", () => {
    const lesson = createMockLesson(source);
    expect(() =>
      validateGeneratedLesson(
        {
          ...lesson,
          mainActivity: { ...lesson.mainActivity, durationMinutes: 30 },
        },
        source,
      ),
    ).toThrow("must total 60 minutes");
  });
  it("rejects changed teaching parameters", () => {
    expect(() =>
      validateGeneratedLesson(
        {
          ...createMockLesson(source),
          subject: "Mathematics",
          gradeLevel: "Grade 1",
          durationMinutes: 45,
        },
        source,
      ),
    ).toThrow("durationMinutes must be 60");
  });
  it("accepts optional teacher context and legacy requests", () => {
    expect(
      lessonSourceSchema.parse({
        ...source,
        language: "Swedish",
        curriculum: "Lgr22",
        classSize: 26,
        availableMaterials: "Paper",
        additionalInstructions: "Outdoor activity",
      }),
    ).toMatchObject({ language: "Swedish", classSize: 26 });
    expect(
      validateGeneratedLesson(createMockLesson(source), source).subject,
    ).toBe("Swedish");
  });
  it("handles maximum accepted brief lengths in the deterministic provider", () => {
    const brief = {
      ...source,
      topic: "T".repeat(240),
      objectives: "O".repeat(2000),
      standards: "S".repeat(1000),
      durationMinutes: 240,
    };
    const lesson = validateGeneratedLesson(createMockLesson(brief), brief);
    expect(lesson.title.length).toBeLessThanOrEqual(160);
    expect(lesson.objectives.join("")).toHaveLength(2000);
    expect(lesson.standards.join("")).toHaveLength(1000);
  });
});
