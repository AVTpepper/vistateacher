import { z } from "zod";

export const feedbackSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.email("Enter a valid email address.").trim().max(254),
  category: z.enum(["account", "billing", "bug", "feedback", "other"]),
  message: z
    .string()
    .trim()
    .min(20, "Add a little more detail so we can help.")
    .max(2_000, "Keep your message under 2,000 characters."),
  website: z.string().max(0).default(""),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
