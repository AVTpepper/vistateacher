// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/settings/deletion/route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/policy";

const state = vi.hoisted(() => ({
  tasks: [] as (() => Promise<void>)[],
  enqueue: vi.fn(async () => "private-receipt"),
  process: vi.fn(async () => "complete"),
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (callback: () => Promise<void>) => state.tasks.push(callback),
}));
vi.mock("@/lib/auth/request", () => ({ hasTrustedOrigin: () => true }));
vi.mock("@/lib/auth/route-account", () => ({
  getRouteAccount: async () => ({ uid: "owner" }),
}));
vi.mock("@/lib/accounts/deletion", () => ({
  enqueueAccountDeletion: state.enqueue,
  processAccountDeletion: state.process,
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.tasks.length = 0;
});
const request = () =>
  new NextRequest("https://vista.test/api/settings/deletion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation: "DELETE" }),
  });

it("delivers a durable receipt and clears the login session before cleanup runs", async () => {
  const response = await POST(request());
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({
    ok: true,
    receipt: "private-receipt",
    status: "pending",
  });
  expect(response.cookies.get(SESSION_COOKIE_NAME)?.maxAge).toBe(0);
  expect(state.enqueue).toHaveBeenCalledWith("owner");
  expect(state.process).not.toHaveBeenCalled();
  await state.tasks[0]();
  expect(state.process).toHaveBeenCalledWith("owner");
});

it("keeps the session when a deletion request cannot be persisted", async () => {
  state.enqueue.mockRejectedValueOnce(new Error("Database unavailable"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  expect(state.tasks).toHaveLength(0);
});
