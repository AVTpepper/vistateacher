import {
  lessonPlanSchema,
  type LessonPlanInput,
  type LessonSourceInput,
} from "@/schemas/lesson";

export function createMockLesson(source: LessonSourceInput): LessonPlanInput {
  const warmUpMinutes = Math.max(5, Math.round(source.durationMinutes * 0.15));
  const closingMinutes = Math.max(5, Math.round(source.durationMinutes * 0.15));
  const mainMinutes = source.durationMinutes - warmUpMinutes - closingMinutes;
  return lessonPlanSchema.parse({
    title: `${source.topic}: A ${source.teachingStyle} lesson`,
    subject: source.subject,
    gradeLevel: source.gradeLevel,
    durationMinutes: source.durationMinutes,
    objectives: source.objectives
      ? [source.objectives]
      : [
          `Explain the central ideas in ${source.topic}.`,
          `Apply learning about ${source.topic} to a new example.`,
        ],
    materials: ["Board or display", "Student notebooks", "Exit ticket"],
    warmUp: {
      durationMinutes: warmUpMinutes,
      activity: `Invite students to record what they notice and wonder about a familiar example of ${source.topic}, then compare ideas with a partner.`,
    },
    mainActivity: {
      durationMinutes: mainMinutes,
      description: `Guide students through an age-appropriate ${source.teachingStyle} investigation of ${source.topic}.`,
      steps: [
        "Model the core idea with one clear example and invite student observations.",
        "Have pairs investigate a second example and record evidence for their thinking.",
        "Bring the class together to compare strategies, clarify misconceptions, and name the key learning.",
        "Ask students to apply the learning independently to a new context.",
      ],
    },
    closingActivity: {
      durationMinutes: closingMinutes,
      activity: `Students complete an exit ticket explaining one important idea about ${source.topic} and one question they still have.`,
    },
    assessment:
      "Use partner explanations, independent work, and the exit ticket to identify secure understanding and the next instructional step.",
    differentiation: {
      supports: [
        "Provide a worked example and a concise word bank.",
        "Offer sentence frames for explaining evidence and reasoning.",
      ],
      extensions: [
        "Ask students to create and justify a more complex example.",
        "Invite students to compare two valid strategies and evaluate their efficiency.",
      ],
    },
    standards: source.standards ? [source.standards] : [],
  });
}
