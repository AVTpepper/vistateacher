// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { PrivateRecoveryError } from "@/lib/profiles/private-user";
import { SESSION_COOKIE_NAME } from "@/lib/auth/policy";

const state = vi.hoisted(() => ({
  origin: true,
  verify: vi.fn(),
  cookie: vi.fn(),
  recover: vi.fn(),
}));
vi.mock("@/lib/auth/request", () => ({ hasTrustedOrigin: () => state.origin }));
vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: () => ({
    verifyIdToken: state.verify,
    createSessionCookie: state.cookie,
  }),
  adminDb: vi.fn(),
}));
vi.mock("@/lib/profiles/private-user", async (original) => ({
  ...(await original<typeof import("@/lib/profiles/private-user")>()),
  recoverPrivateUser: state.recover,
}));
const request = () =>
  new NextRequest("https://vista.test/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: "x".repeat(100) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.origin = true;
  state.verify.mockResolvedValue({
    uid: "verified-owner",
    email: "verified-login@example.com",
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
  });
  state.cookie.mockResolvedValue("verified-session");
  state.recover.mockResolvedValue({ state: "ready" });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

it.each(["ready", "recovery-required"])(
  "signs an existing %s account in using only the verified token identity",
  async (recoveryState) => {
    state.recover.mockResolvedValue({ state: recoveryState });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ next: "/app" });
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe(
      "verified-session",
    );
    expect(state.recover).toHaveBeenCalledWith(
      "verified-owner",
      "verified-login@example.com",
      { allowMissingProfile: true },
    );
  },
);

it("routes a new account to onboarding through the helper's no-write state", async () => {
  state.recover.mockResolvedValue({ state: "onboarding-required" });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ next: "/onboarding" });
});

it.each(["inactive", "deletion-blocked"] as const)(
  "does not issue an active session when recovery finds %s",
  async (code) => {
    state.recover.mockRejectedValue(new PrivateRecoveryError(code));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
    expect(await response.json()).toMatchObject({ code });
  },
);

it("makes a database recovery failure retryable instead of routing to onboarding", async () => {
  state.recover.mockRejectedValue(new Error("PRIVATE_DATABASE_PAYLOAD"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "PRIVATE_DATABASE_PAYLOAD",
  );
});

it("refuses a token without an account email before recovery or cookie creation", async () => {
  state.verify.mockResolvedValue({ email_verified: true });
  expect((await POST(request())).status).toBe(403);
  expect(state.recover).not.toHaveBeenCalled();
  expect(state.cookie).not.toHaveBeenCalled();
});

it("checks the request origin before token verification", async () => {
  state.origin = false;
  expect((await POST(request())).status).toBe(403);
  expect(state.verify).not.toHaveBeenCalled();
});
