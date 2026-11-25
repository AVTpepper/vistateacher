import type { TeachingDocument } from "@/lib/documents/docx";
import type { LessonPlanInput } from "@/schemas/lesson";

export function lessonDocument(content: LessonPlanInput): TeachingDocument {
  return {
    title: content.title,
    subtitle: [
      content.subject,
      content.gradeLevel,
      content.durationMinutes + " minutes",
    ].join(" | "),
    sections: [
      ["Learning objectives", content.objectives],
      ["Materials", content.materials],
      [
        `Warm-up (${content.warmUp.durationMinutes} minutes)`,
        [content.warmUp.activity],
      ],
      [
        `Main activity (${content.mainActivity.durationMinutes} minutes)`,
        [content.mainActivity.description, ...content.mainActivity.steps],
      ],
      [
        `Closing activity (${content.closingActivity.durationMinutes} minutes)`,
        [content.closingActivity.activity],
      ],
      ["Assessment", [content.assessment]],
      ["Supports and scaffolds", content.differentiation.supports],
      ["Extensions and challenges", content.differentiation.extensions],
      ["Standards", content.standards],
    ],
    bullets: true,
  };
}
