import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { createMockLesson } from "@/lib/lessons/mock-provider";
import {
  lessonPlanSchema,
  type LessonPlanInput,
  type LessonSourceInput,
} from "@/schemas/lesson";

const SYSTEM_PROMPT = `You are an expert curriculum designer. Create a practical, classroom-ready lesson plan using only the supplied educator parameters. Keep activities age-appropriate, make durations add up to the requested total, include observable objectives and a usable formative assessment, and do not invent a standards code unless the educator supplied one.`;

function sourcePrompt(source: LessonSourceInput): string {
  return [
    `Subject: ${source.subject}`,
    `Grade level: ${source.gradeLevel}`,
    `Topic or unit: ${source.topic}`,
    `Total duration: ${source.durationMinutes} minutes`,
    `Teaching style: ${source.teachingStyle}`,
    `Requested objectives: ${source.objectives || "Use your professional judgment."}`,
    `Standards: ${source.standards || "No specific standards supplied."}`,
    `Student needs: ${source.studentNeeds || "No specific needs supplied."}`,
  ].join("\n");
}

async function requestStructuredLesson(
  client: OpenAI,
  source: LessonSourceInput,
  repair: boolean,
): Promise<LessonPlanInput> {
  const response = await client.responses.parse({
    model: process.env.OPENAI_LESSON_MODEL ?? "gpt-4.1-mini",
    instructions: repair
      ? `${SYSTEM_PROMPT} A previous attempt failed validation. Return a complete value matching every required field exactly.`
      : SYSTEM_PROMPT,
    input: sourcePrompt(source),
    text: { format: zodTextFormat(lessonPlanSchema, "lesson_plan") },
  });
  if (!response.output_parsed) throw new Error("empty-structured-output");
  return lessonPlanSchema.parse(response.output_parsed);
}

export async function generateLessonPlan(
  source: LessonSourceInput,
): Promise<LessonPlanInput> {
  if (process.env.AI_PROVIDER === "MOCK") return createMockLesson(source);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI is not configured.");
  const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 45_000 });
  try {
    return await requestStructuredLesson(client, source, false);
  } catch {
    return requestStructuredLesson(client, source, true);
  }
}
