import { z } from "zod";

import { coverThemeSchema } from "@/lib/profiles/cover-themes";

const optionalUrl = z
  .union([z.string().trim().max(200), z.null()])
  .transform((value) => value || null)
  .refine(
    (value) =>
      value === null ||
      z
        .url()
        .safeParse(
          value.startsWith("http://") || value.startsWith("https://")
            ? value
            : `https://${value}`,
        ).success,
    "Enter a valid website.",
  )
  .transform((value) => {
    if (!value) return null;
    return value.startsWith("http://") || value.startsWith("https://")
      ? value
      : `https://${value}`;
  });

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  professionalRoles: z
    .array(z.string().trim().min(2).max(60))
    .min(1)
    .max(4)
    .default(["Educator"]),
  gradeLevel: z.string().trim().min(2).max(50),
  subjects: z.array(z.string().trim().min(2).max(40)).min(1).max(6),
  languages: z.array(z.string().trim().min(2).max(40)).max(8).default([]),
  country: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  school: z.string().trim().max(120),
  yearsOfExperience: z.number().int().min(0).max(60),
  bio: z.string().trim().max(500),
  website: optionalUrl,
  interests: z.array(z.string().trim().min(2).max(40)).max(8),
});

export const privateSettingsSchema = z.object({
  contactDetails: z.object({
    professionalEmail: z.union([z.literal(""), z.email()]).default(""),
    phone: z.string().trim().max(30).default(""),
  }),
  privacySettings: z.object({
    shareContactInfo: z.boolean(),
  }),
  notificationSettings: z.object({
    email: z.boolean(),
    inApp: z.boolean(),
  }),
});

export const deletionRequestSchema = z.object({
  confirmation: z.literal("DELETE"),
});

export const profileDocumentSchema = profileUpdateSchema.extend({
  uid: z.string().min(1),
  photoURL: z.string().nullable(),
  coverImageURL: z.string().nullable(),
  coverTheme: coverThemeSchema.catch("burgundy-bloom"),
  role: z.enum(["educator", "school_admin", "platform_admin"]),
  isVerified: z.boolean(),
  connectionCount: z.number().int().nonnegative().default(0),
  resourceCount: z.number().int().nonnegative(),
  postCount: z.number().int().nonnegative(),
  status: z.enum(["active", "suspended", "deleted"]),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

export const privateUserDocumentSchema = privateSettingsSchema.extend({
  email: z.email(),
  accountDeletion: z.object({ requestedAt: z.unknown().nullable() }),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;
export type ProfileUpdate = z.output<typeof profileUpdateSchema>;
export type PrivateSettings = z.infer<typeof privateSettingsSchema>;
export type ProfileDocument = z.infer<typeof profileDocumentSchema>;
export type PrivateUserDocument = z.infer<typeof privateUserDocumentSchema>;
