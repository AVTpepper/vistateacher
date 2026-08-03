import { describe, expect, it } from "vitest";

import { lessonPlanSchema } from "./lesson";

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
});
