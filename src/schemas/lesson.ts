import { z } from "zod";

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
