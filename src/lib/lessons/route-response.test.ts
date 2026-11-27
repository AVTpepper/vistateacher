// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lessonRoute } from "./route-response";

const state = vi.hoisted(() => ({
  account: { uid: "teacher-b" } as { uid: string } | null,
}));
vi.mock("@/lib/auth/request", () => ({ hasTrustedOrigin: () => true }));
vi.mock("@/lib/auth/route-account", () => ({
  getRouteAccount: async () => state.account,
}));
vi.mock("@/lib/lessons/server", () => ({
  LessonActionError: class extends Error {},
}));
beforeEach(() => {
  state.account = { uid: "teacher-b" };
});

describe("lesson account binding", () => {
  it.each(["GET", "POST", "PATCH", "DELETE"])(
    "rejects an old tab's %s before any data read or charge",
    async (method) => {
      const action = vi.fn(async () => Response.json({ ok: true }));
      const response = await lessonRoute(
        new NextRequest("https://vista.test/api/ai-lessons", {
          method,
          headers: { "X-Vista-Expected-Uid": "teacher-a" },
        }),
        action,
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: "account-changed" });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(action).not.toHaveBeenCalled();
    },
  );
  it("uses the verified account for a matching tab", async () => {
    const action = vi.fn(async () => Response.json({ ok: true }));
    const response = await lessonRoute(
      new NextRequest("https://vista.test/api/ai-lessons", {
        headers: { "X-Vista-Expected-Uid": "teacher-b" },
      }),
      action,
    );
    expect(response.status).toBe(200);
    expect(action).toHaveBeenCalledWith("teacher-b");
  });
  it("does not substitute an expected account for a missing login", async () => {
    state.account = null;
    const action = vi.fn(async () => Response.json({ ok: true }));
    const response = await lessonRoute(
      new NextRequest("https://vista.test/api/ai-lessons", {
        headers: { "X-Vista-Expected-Uid": "teacher-a" },
      }),
      action,
    );
    expect(response.status).toBe(401);
    expect(action).not.toHaveBeenCalled();
  });
});
