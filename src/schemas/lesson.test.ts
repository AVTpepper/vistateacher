import { describe, expect, it } from "vitest";

import {
  lessonPlanSchema,
  lessonSourceSchema,
  lessonUpdateSchema,
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
    expect(lessonUpdateSchema.parse({ content: validLesson }).content).toEqual(
      validLesson,
    );
    expect(() =>
      lessonUpdateSchema.parse({
        content: { ...validLesson, standards: null },
      }),
    ).toThrow();
  });
});
