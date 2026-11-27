// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { MessageActionError } from "@/lib/messages/server";

const state = vi.hoisted(() => ({
  origin: true,
  account: { uid: "verified-reporter" } as { uid: string } | null,
  report: vi.fn(),
}));
vi.mock("@/lib/auth/request", () => ({ hasTrustedOrigin: () => state.origin }));
vi.mock("@/lib/auth/route-account", () => ({
  getRouteAccount: async () => state.account,
}));
vi.mock("@/lib/messages/server", async (original) => ({
  ...(await original<typeof import("@/lib/messages/server")>()),
  reportMessage: state.report,
}));
const payload = {
  messageId: "message-one",
  reason: "unsafe",
  details: "Keep the unsafe classroom example for moderator review.",
};
const context = () => ({
  params: Promise.resolve({ conversationId: "actual-conversation" }),
});
const request = (body: unknown = payload) =>
  new NextRequest(
    "https://vista.test/api/messages/actual-conversation/report",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
beforeEach(() => {
  vi.clearAllMocks();
  state.origin = true;
  state.account = { uid: "verified-reporter" };
  state.report.mockResolvedValue(undefined);
});

it("returns the actual reported:true contract required by the shared dialog after saving the authenticated report", async () => {
  const response = await POST(
    request({
      ...payload,
      conversationId: "forged-conversation",
      reporterId: "forged-reporter",
    }),
    context(),
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ ok: true, reported: true });
  expect(state.report).toHaveBeenCalledExactlyOnceWith("verified-reporter", {
    ...payload,
    conversationId: "actual-conversation",
  });
});

it.each([
  ["already-reported", 409],
  ["not-member", 403],
  ["inactive", 403],
] as const)(
  "preserves the real %s error contract for the dialog",
  async (code, status) => {
    state.report.mockRejectedValue(new MessageActionError(code));
    const response = await POST(request(), context());
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.code).toBe(code);
    expect(body).not.toHaveProperty("reported");
  },
);

it("rejects an invalid origin before accepting report data", async () => {
  state.origin = false;
  expect((await POST(request(), context())).status).toBe(403);
  expect(state.report).not.toHaveBeenCalled();
});

it("requires a verified account before submitting the report", async () => {
  state.account = null;
  expect((await POST(request(), context())).status).toBe(401);
  expect(state.report).not.toHaveBeenCalled();
});

it("rejects malformed report input without producing a success acknowledgement", async () => {
  const response = await POST(
    request({ ...payload, reason: "unknown" }),
    context(),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).not.toHaveProperty("reported");
  expect(state.report).not.toHaveBeenCalled();
});
