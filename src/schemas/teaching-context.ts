import { z } from "zod";

export const teachingContextSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  gradeLevel: z.string().trim().min(1).max(80),
  topic: z.string().trim().min(3).max(240),
  objectives: z.string().trim().max(2_000).default(""),
  standards: z.string().trim().max(1_000).default(""),
  studentNeeds: z.string().trim().max(2_000).default(""),
  curriculum: z.string().trim().max(500).optional(),
  language: z.string().trim().max(80).optional(),
  classSize: z.number().int().min(1).max(200).optional(),
  availableMaterials: z.string().trim().max(1_000).optional(),
  additionalInstructions: z.string().trim().max(2_000).optional(),
});

export type TeachingContextInput = z.infer<typeof teachingContextSchema>;
