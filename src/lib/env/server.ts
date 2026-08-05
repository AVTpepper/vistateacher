import "server-only";

import { z } from "zod";

import { stripeModeSchema } from "@/lib/billing/stripe-mode";

const serverEnvSchema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  STRIPE_MODE: stripeModeSchema.default("TEST"),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PRICE_PLUS_MONTHLY: z.string().startsWith("price_"),
  STRIPE_PRICE_PLUS_YEARLY: z.string().startsWith("price_"),
  OPENAI_API_KEY: z.string().startsWith("sk-"),
  ADMIN_BOOTSTRAP_EMAILS: z.string().default(""),
  AI_PROVIDER: z.enum(["OPENAI", "MOCK"]).default("OPENAI"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

const firebaseAdminEnvSchema = serverEnvSchema.pick({
  FIREBASE_PROJECT_ID: true,
  FIREBASE_CLIENT_EMAIL: true,
  FIREBASE_PRIVATE_KEY: true,
});

export type FirebaseAdminEnv = z.infer<typeof firebaseAdminEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cachedServerEnv) {
    cachedServerEnv = serverEnvSchema.parse(process.env);
  }

  return cachedServerEnv;
}

export function getFirebaseAdminEnv(): FirebaseAdminEnv {
  return firebaseAdminEnvSchema.parse(process.env);
}
