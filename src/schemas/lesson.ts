import { z } from "zod";
import { teachingContextSchema } from "@/schemas/teaching-context";

export const lessonSourceSchema = teachingContextSchema.extend({
  durationMinutes: z.number().int().min(15).max(240),
  teachingStyle: z.enum(["inquiry", "balanced", "direct"]),
});

export const lessonPlanSchema = z.object({
  title: z.string().trim().min(3).max(160),
  subject: z.string().trim().min(1).max(80),
  gradeLevel: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().min(15).max(240),
  objectives: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
  materials: z.array(z.string().trim().min(1).max(200)).max(30),
  warmUp: z.object({
    durationMinutes: z.number().int().min(1).max(60),
    activity: z.string().trim().min(1).max(2_000),
  }),
  mainActivity: z.object({
    durationMinutes: z.number().int().min(1).max(180),
    description: z.string().trim().min(1).max(4_000),
    steps: z.array(z.string().trim().min(1).max(1_000)).min(1).max(20),
  }),
  closingActivity: z.object({
    durationMinutes: z.number().int().min(1).max(60),
    activity: z.string().trim().min(1).max(2_000),
  }),
  assessment: z.string().trim().min(1).max(3_000),
  differentiation: z.object({
    supports: z.array(z.string().trim().min(1).max(500)).max(15),
    extensions: z.array(z.string().trim().min(1).max(500)).max(15),
  }),
  standards: z.array(z.string().trim().min(1).max(300)).max(20),
});

export type LessonPlanInput = z.infer<typeof lessonPlanSchema>;
export type LessonSourceInput = z.infer<typeof lessonSourceSchema>;
export const lessonVisibilitySchema = z.enum(["draft", "published"]);

export const lessonUpdateSchema = z.object({
  content: lessonPlanSchema,
  visibility: lessonVisibilitySchema.optional(),
  expectedVersion: z.number().int().min(1),
});

export const lessonActionSchema = z.object({
  lessonId: z
    .string()
    .trim()
    .regex(/^[\w-]{1,128}$/),
});

export const lessonRequestIdSchema = z.string().uuid();

export const lessonCreateRequestSchema = z.object({
  source: lessonSourceSchema,
  count: z.number().int().min(1).max(5).default(1),
  requestId: lessonRequestIdSchema,
  retryId: lessonRequestIdSchema.optional(),
});

export const lessonRegenerateSchema = z.object({
  requestId: lessonRequestIdSchema,
  retryId: lessonRequestIdSchema.optional(),
  expectedVersion: z.number().int().min(1),
  source: lessonSourceSchema.optional(),
  feedback: z.string().trim().min(3).max(2_000).optional(),
  referenceContent: lessonPlanSchema.optional(),
});

export const lessonExportFormatSchema = z.enum(["pdf", "docx"]);

export const lessonRestoreSchema = z.object({
  expectedVersion: z.number().int().min(1),
});

export const lessonVersionNumberSchema = z.coerce.number().int().min(1);

export const lessonCursorSchema = z
  .string()
  .regex(/^[\w-]{1,128}$/)
  .optional();
