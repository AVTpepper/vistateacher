import { z } from "zod";
import { teachingContextSchema } from "@/schemas/teaching-context";

export const WORKSHEET_QUESTION_TYPES = [
  "multipleChoice",
  "shortAnswer",
  "extendedResponse",
  "matching",
  "fillInBlank",
  "trueFalse",
] as const;
export const WORKSHEET_QUESTION_LABELS = {
  multipleChoice: "Multiple choice",
  shortAnswer: "Short answer",
  extendedResponse: "Extended response",
  matching: "Matching",
  fillInBlank: "Fill-in-the-blank",
  trueFalse: "True/false",
} as const;
export const worksheetQuestionTypeSchema = z.enum(WORKSHEET_QUESTION_TYPES);
export type WorksheetQuestionType = z.infer<typeof worksheetQuestionTypeSchema>;
export const worksheetDifficultySchema = z.enum([
  "foundation",
  "core",
  "challenge",
]);

export const worksheetSourceSchema = teachingContextSchema
  .extend({
    difficulty: z.enum(["foundation", "core", "challenge", "mixed"]),
    questionCounts: z.record(
      worksheetQuestionTypeSchema,
      z.number().int().min(0).max(30),
    ),
    sourceLessonId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .optional(),
  })
  .superRefine((source, context) => {
    const total = Object.values(source.questionCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    if (total < 1 || total > 30)
      context.addIssue({
        code: "custom",
        path: ["questionCounts"],
        message: "Choose between 1 and 30 questions in total.",
      });
  });

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/);
const questionBase = {
  id: identifier,
  prompt: z.string().trim().min(1).max(2_000),
  difficulty: worksheetDifficultySchema,
};
const matchItem = z.object({
  id: identifier,
  text: z.string().trim().min(1).max(500),
});

export const worksheetQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    ...questionBase,
    type: z.literal("multipleChoice"),
    options: z
      .array(
        z.object({ id: identifier, text: z.string().trim().min(1).max(500) }),
      )
      .min(2)
      .max(6),
  }),
  z.object({
    ...questionBase,
    type: z.literal("shortAnswer"),
    responseLines: z.number().int().min(1).max(10),
  }),
  z.object({
    ...questionBase,
    type: z.literal("extendedResponse"),
    responseLines: z.number().int().min(3).max(30),
  }),
  z.object({
    ...questionBase,
    type: z.literal("matching"),
    left: z.array(matchItem).min(2).max(8),
    right: z.array(matchItem).min(2).max(8),
  }),
  z.object({ ...questionBase, type: z.literal("fillInBlank") }),
  z.object({
    ...questionBase,
    type: z.literal("trueFalse"),
    trueLabel: z.string().trim().min(1).max(40),
    falseLabel: z.string().trim().min(1).max(40),
  }),
]);
const answerBase = { questionId: identifier };
export const worksheetAnswerSchema = z.discriminatedUnion("type", [
  z.object({
    ...answerBase,
    type: z.literal("multipleChoice"),
    correctOptionId: identifier,
    explanation: z.string().trim().min(1).max(2_000),
  }),
  z.object({
    ...answerBase,
    type: z.literal("shortAnswer"),
    modelAnswer: z.string().trim().min(1).max(3_000),
    acceptedAlternatives: z.array(z.string().trim().min(1).max(500)).max(10),
  }),
  z.object({
    ...answerBase,
    type: z.literal("extendedResponse"),
    exampleResponse: z.string().trim().min(1).max(4_000),
    assessmentCriteria: z
      .array(z.string().trim().min(1).max(500))
      .min(1)
      .max(10),
  }),
  z.object({
    ...answerBase,
    type: z.literal("matching"),
    pairs: z
      .array(z.object({ leftId: identifier, rightId: identifier }))
      .min(2)
      .max(8),
  }),
  z.object({
    ...answerBase,
    type: z.literal("fillInBlank"),
    acceptedAnswers: z
      .array(
        z.object({
          alternatives: z
            .array(z.string().trim().min(1).max(300))
            .min(1)
            .max(5),
        }),
      )
      .min(1)
      .max(10),
  }),
  z.object({
    ...answerBase,
    type: z.literal("trueFalse"),
    answer: z.boolean(),
    explanation: z.string().trim().min(1).max(2_000),
  }),
]);

export const worksheetContentSchema = z.object({
  title: z.string().trim().min(3).max(160),
  subject: z.string().trim().min(1).max(80),
  gradeLevel: z.string().trim().min(1).max(80),
  language: z.string().trim().min(1).max(80),
  instructions: z.string().trim().min(1).max(2_000),
  labels: z.object({
    name: z.string().trim().min(1).max(80),
    date: z.string().trim().min(1).max(80),
    answerKey: z.string().trim().min(1).max(120),
  }),
  questions: z.array(worksheetQuestionSchema).min(1).max(30),
  answerKey: z.array(worksheetAnswerSchema).min(1).max(30),
});
export const worksheetUpdateSchema = z.object({
  content: worksheetContentSchema,
  expectedVersion: z.number().int().min(1),
});
export const worksheetCreateSchema = z.object({
  source: worksheetSourceSchema,
  requestId: z.uuid(),
});
export const worksheetRegenerateSchema = z.object({
  expectedVersion: z.number().int().min(1),
  requestId: z.uuid(),
});
export const studentWorksheetSchema = worksheetContentSchema.omit({
  answerKey: true,
});
export type StudentWorksheet = z.infer<typeof studentWorksheetSchema>;
export type WorksheetSourceInput = z.infer<typeof worksheetSourceSchema>;
export type WorksheetContent = z.infer<typeof worksheetContentSchema>;
export type WorksheetQuestion = z.infer<typeof worksheetQuestionSchema>;
export type WorksheetAnswer = z.infer<typeof worksheetAnswerSchema>;
