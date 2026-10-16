import { z } from "zod";

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(9099),
  NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(8080),
  NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(9199),
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

let cachedClientEnv: ClientEnv | undefined;

export function getClientEnv(): ClientEnv {
  if (!cachedClientEnv) {
    cachedClientEnv = clientEnvSchema.parse({
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID:
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
        process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT:
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT,
      NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT:
        process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT,
      NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT:
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT,
      NEXT_PUBLIC_USE_FIREBASE_EMULATORS:
        process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS,
    });
  }

  return cachedClientEnv;
}
