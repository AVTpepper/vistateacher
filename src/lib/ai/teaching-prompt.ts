import type { z } from "zod";
import type { teachingContextSchema } from "@/schemas/teaching-context";

export function teachingContextPrompt(
  source: z.infer<typeof teachingContextSchema>,
): string {
  return [
    `Subject: ${source.subject}`,
    `Grade level: ${source.gradeLevel}`,
    `Topic or unit: ${source.topic}`,
    `Requested objectives: ${source.objectives || "Use your professional judgment."}`,
    `Standards: ${source.standards || "No specific standards supplied."}`,
    `Student needs: ${source.studentNeeds || "No specific needs supplied."}`,
    `Curriculum / country: ${source.curriculum || "No specific curriculum supplied; do not claim curriculum alignment."}`,
    `Output language: ${source.language || "English"}`,
    `Class size: ${source.classSize ?? "Not specified"}`,
    `Available materials: ${source.availableMaterials || "Use common classroom materials."}`,
    `Additional teacher instructions: ${source.additionalInstructions || "None"}`,
  ].join("\n");
}
