import { describe, expect, it } from "vitest";

import {
  lessonPlanSchema,
  lessonSourceSchema,
  lessonUpdateSchema,
  lessonCreateRequestSchema,
  lessonRegenerateSchema,
} from "./lesson";

const validLesson = {
  title: "Investigating local ecosystems",
  subject: "Science",
  gradeLevel: "Grade 6",
  durationMinutes: 50,
  objectives: ["Describe relationships in a local food web."],
  materials: ["Species cards"],
  warmUp: { durationMinutes: 5, activity: "Notice and wonder." },
  mainActivity: {
    durationMinutes: 35,
    description: "Construct and revise a food web model.",
    steps: ["Sort species cards.", "Connect producers and consumers."],
  },
  closingActivity: { durationMinutes: 10, activity: "Write an exit ticket." },
  assessment: "Review models and exit tickets.",
  differentiation: {
    supports: ["Provide sentence frames."],
    extensions: ["Model the removal of one species."],
  },
  standards: ["MS-LS2-3"],
};

describe("lessonPlanSchema", () => {
  it("accepts a complete structured lesson", () => {
    expect(lessonPlanSchema.parse(validLesson)).toEqual(validLesson);
  });

  it("rejects malformed model output", () => {
    expect(() =>
      lessonPlanSchema.parse({ ...validLesson, objectives: [] }),
    ).toThrow();
  });

  it("bounds generation parameters", () => {
    expect(
      lessonSourceSchema.parse({
        subject: "Science",
        gradeLevel: "Grade 6",
        topic: "Local food webs",
        durationMinutes: 50,
        teachingStyle: "inquiry",
      }),
    ).toMatchObject({
      objectives: "",
      standards: "",
      studentNeeds: "",
    });
    expect(() =>
      lessonSourceSchema.parse({
        subject: "Science",
        gradeLevel: "Grade 6",
        topic: "x".repeat(241),
        durationMinutes: 50,
        teachingStyle: "inquiry",
      }),
    ).toThrow();
  });

  it("requires complete structured content for edits", () => {
    expect(
      lessonUpdateSchema.parse({ content: validLesson, expectedVersion: 1 })
        .content,
    ).toEqual(validLesson);
    expect(() =>
      lessonUpdateSchema.parse({
        content: { ...validLesson, standards: null },
        expectedVersion: 1,
      }),
    ).toThrow();
  });

  it("requires stable generation IDs and the editor's base version", () => {
    const source = {
      subject: "Science",
      gradeLevel: "Grade 6",
      topic: "Food webs",
      durationMinutes: 50,
      teachingStyle: "inquiry",
    };
    expect(lessonCreateRequestSchema.safeParse({ source }).success).toBe(false);
    expect(
      lessonCreateRequestSchema.safeParse({ source, requestId: "../../other" })
        .success,
    ).toBe(false);
    expect(
      lessonCreateRequestSchema.parse({
        source,
        requestId: "7b850452-c06f-42b0-89aa-d773b6f8d630",
      }).count,
    ).toBe(1);
    expect(lessonUpdateSchema.safeParse({ content: validLesson }).success).toBe(
      false,
    );
    expect(
      lessonRegenerateSchema.safeParse({
        requestId: "7b850452-c06f-42b0-89aa-d773b6f8d630",
      }).success,
    ).toBe(false);
  });
});
