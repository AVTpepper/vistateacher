import { spawnSync } from "node:child_process";

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) throw new Error("Unable to locate the pnpm CLI.");
const pnpmCli: string = npmExecPath;
const env = {
  ...process.env,
  AI_PROVIDER: "MOCK",
  GCLOUD_PROJECT: "demo-vista-teacher",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:demo",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-vista-teacher.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-vista-teacher",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-vista-teacher.appspot.com",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
  NEXT_DIST_DIR: ".next-e2e",
  PLAYWRIGHT_E2E_PRODUCTION: "true",
};

function run(args: string[]): void {
  const result = spawnSync(process.execPath, [pnpmCli, ...args], {
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["seed"]);
run(["build"]);
run(["exec", "playwright", "test", ...process.argv.slice(2)]);
