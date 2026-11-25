import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    env: {
      GCLOUD_PROJECT: "demo-vista-teacher",
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-vista-teacher.appspot.com",
      AI_PROVIDER: "MOCK",
    },
    globals: true,
    include: ["tests/rules/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
