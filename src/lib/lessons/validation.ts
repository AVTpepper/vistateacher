import { lessonPlanSchema, type LessonSourceInput } from "@/schemas/lesson";

/** Validate the teaching brief as well as the shape of the model response. */
export function validateGeneratedLesson(
  value: unknown,
  source: LessonSourceInput,
) {
  const lesson = lessonPlanSchema.parse(value);
  const scheduled =
    lesson.warmUp.durationMinutes +
    lesson.mainActivity.durationMinutes +
    lesson.closingActivity.durationMinutes;
  const errors: string[] = [];
  if (scheduled !== source.durationMinutes)
    errors.push(
      `Activity durations total ${scheduled}; they must total ${source.durationMinutes} minutes.`,
    );
  if (lesson.durationMinutes !== source.durationMinutes)
    errors.push(`durationMinutes must be ${source.durationMinutes}.`);
  if (lesson.subject !== source.subject)
    errors.push(`subject must be ${JSON.stringify(source.subject)}.`);
  if (lesson.gradeLevel !== source.gradeLevel)
    errors.push(`gradeLevel must be ${JSON.stringify(source.gradeLevel)}.`);
  if (errors.length) throw new Error(errors.join(" "));
  return lesson;
}
