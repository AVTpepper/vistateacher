import { describe, expect, it } from "vitest";
import { lessonDocument } from "./document";
import type { LessonPlanInput } from "@/schemas/lesson";

describe("lesson document projection", () => {
  it("preserves every teacher-authored section and its chosen-language text", () => {
    const content: LessonPlanInput = {
      title: "Årstider och lärande",
      subject: "Naturkunskap",
      gradeLevel: "Årskurs 6",
      durationMinutes: 60,
      objectives: ["Förklara fotosyntesen."],
      materials: ["Växter och mätglas"],
      warmUp: { durationMinutes: 10, activity: "Vad behöver växter?" },
      mainActivity: {
        durationMinutes: 40,
        description: "Undersök växternas miljö.",
        steps: ["Mät ljuset.", "Jämför resultaten."],
      },
      closingActivity: { durationMinutes: 10, activity: "Sammanfatta fynden." },
      assessment: "Förklara ditt resonemang.",
      differentiation: {
        supports: ["Använd en ordlista."],
        extensions: ["Pröva en ny hypotes."],
      },
      standards: ["Lokala mål för årskurs 6"],
    };

    const document = lessonDocument(content);
    expect(document.title).toBe(content.title);
    expect(document.subtitle).toBe("Naturkunskap | Årskurs 6 | 60 minutes");
    expect(document.bullets).toBe(true);
    expect(document.sections.flatMap(([, items]) => items)).toEqual([
      ...content.objectives,
      ...content.materials,
      content.warmUp.activity,
      content.mainActivity.description,
      ...content.mainActivity.steps,
      content.closingActivity.activity,
      content.assessment,
      ...content.differentiation.supports,
      ...content.differentiation.extensions,
      ...content.standards,
    ]);
    expect(document.sections.map(([heading]) => heading)).toContain(
      "Main activity (40 minutes)",
    );
  });
});
