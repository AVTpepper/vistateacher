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

export interface LessonGenerationOptions {
  feedback?: string;
  referencePlan?: LessonPlanInput;
}

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

function referencePrompt(referencePlan?: LessonPlanInput): string {
  if (!referencePlan) return "";
  return [
    "Reference lesson content:",
    `Title: ${referencePlan.title}`,
    `Objectives: ${referencePlan.objectives.join(" | ") || "None"}`,
    `Materials: ${referencePlan.materials.join(" | ") || "None"}`,
    `Warm-up: ${referencePlan.warmUp.activity}`,
    `Main activity summary: ${referencePlan.mainActivity.description}`,
    `Main steps: ${referencePlan.mainActivity.steps.join(" | ")}`,
    `Closing: ${referencePlan.closingActivity.activity}`,
    `Assessment: ${referencePlan.assessment}`,
    `Supports: ${referencePlan.differentiation.supports.join(" | ") || "None"}`,
    `Extensions: ${referencePlan.differentiation.extensions.join(" | ") || "None"}`,
    `Standards: ${referencePlan.standards.join(" | ") || "None"}`,
  ].join("\n");
}

function generationInstructions(
  repair: boolean,
  options: LessonGenerationOptions,
): string {
  const feedback = options.feedback?.trim();
  const feedbackPrompt = feedback
    ? `\nEducator feedback for this fresh regeneration: ${feedback}\nRegenerate the entire lesson while prioritizing this feedback, and update any affected sections so the plan remains coherent end-to-end.`
    : "";
  const repairPrompt = repair
    ? " A previous attempt failed validation. Return a complete value matching every required field exactly."
    : "";
  return `${SYSTEM_PROMPT}${repairPrompt}${feedbackPrompt}`;
}

async function requestStructuredLesson(
  client: OpenAI,
  source: LessonSourceInput,
  repair: boolean,
  options: LessonGenerationOptions,
): Promise<LessonPlanInput> {
  const response = await client.responses.parse({
    model: process.env.OPENAI_LESSON_MODEL ?? "gpt-4.1-mini",
    instructions: generationInstructions(repair, options),
    input: [sourcePrompt(source), referencePrompt(options.referencePlan)]
      .filter(Boolean)
      .join("\n\n"),
    text: { format: zodTextFormat(lessonPlanSchema, "lesson_plan") },
  });
  if (!response.output_parsed) throw new Error("empty-structured-output");
  return lessonPlanSchema.parse(response.output_parsed);
}

export async function generateLessonPlan(
  source: LessonSourceInput,
  options: LessonGenerationOptions = {},
): Promise<LessonPlanInput> {
  if (process.env.AI_PROVIDER === "MOCK") return createMockLesson(source);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI is not configured.");
  const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 45_000 });
  try {
    return await requestStructuredLesson(client, source, false, options);
  } catch {
    return requestStructuredLesson(client, source, true, options);
  }
}
