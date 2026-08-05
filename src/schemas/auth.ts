import { z } from "zod";

import {
  educationStageValues,
  professionalRoles,
  subjectAreas,
  taughtLanguages,
} from "@/lib/profiles/options";

export const signInSchema = z.object({
  email: z.email("Enter a valid email address.").trim(),
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = signInSchema.extend({
  displayName: z.string().trim().min(2).max(80),
  password: z
    .string()
    .min(10, "Use at least 10 characters.")
    .regex(/[a-z]/, "Add a lowercase letter.")
    .regex(/[A-Z]/, "Add an uppercase letter.")
    .regex(/[0-9]/, "Add a number."),
});

export const passwordResetSchema = signInSchema.pick({ email: true });

export const sessionRequestSchema = z.object({
  idToken: z.string().min(100).max(10_000),
});

export const onboardingSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80),
    professionalRoles: z.array(z.enum(professionalRoles)).min(1).max(4),
    gradeLevel: z.enum(educationStageValues),
    subjects: z.array(z.enum(subjectAreas)).min(1).max(6),
    languages: z.array(z.enum(taughtLanguages)).max(8).default([]),
    country: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    school: z.string().trim().max(120).default(""),
    yearsOfExperience: z.number().int().min(0).max(60),
    bio: z.string().trim().max(500).default(""),
    interests: z.array(z.string().trim().min(2).max(40)).max(8).default([]),
  })
  .superRefine((input, context) => {
    if (input.subjects.includes("Languages") && !input.languages.length) {
      context.addIssue({
        code: "custom",
        path: ["languages"],
        message: "Select at least one language you teach.",
      });
    }
  });

export type OnboardingInput = z.infer<typeof onboardingSchema>;
