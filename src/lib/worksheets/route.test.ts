// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { worksheetRoute } from "./route";

const state = vi.hoisted(() => ({
  account: { uid: "teacher-b" } as { uid: string } | null,
}));
vi.mock("@/lib/auth/request", () => ({ hasTrustedOrigin: () => true }));
vi.mock("@/lib/auth/route-account", () => ({
  getRouteAccount: async () => state.account,
}));
vi.mock("@/lib/worksheets/server", () => ({
  WorksheetActionError: class extends Error {},
}));
beforeEach(() => {
  state.account = { uid: "teacher-b" };
});

describe("worksheet account binding", () => {
  it.each(["GET", "POST", "PATCH", "DELETE"])(
    "rejects an old tab's %s before any job or allowance mutation",
    async (method) => {
      const action = vi.fn(async () => Response.json({ ok: true }));
      const response = await worksheetRoute(
        new NextRequest("https://vista.test/api/worksheets", {
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
  it("uses the verified account when the tab matches and preserves clients that omit the optional header", async () => {
    for (const headers of [
      new Headers({ "X-Vista-Expected-Uid": "teacher-b" }),
      new Headers(),
    ]) {
      const action = vi.fn(async () => Response.json({ ok: true }));
      const response = await worksheetRoute(
        new NextRequest("https://vista.test/api/worksheets", {
          method: "POST",
          headers,
        }),
        action,
      );
      expect(response.status).toBe(200);
      expect(action).toHaveBeenCalledWith("teacher-b");
    }
  });
  it("requires an authenticated account independently of the tab header", async () => {
    state.account = null;
    const action = vi.fn(async () => Response.json({ ok: true }));
    const response = await worksheetRoute(
      new NextRequest("https://vista.test/api/worksheets", {
        method: "POST",
        headers: { "X-Vista-Expected-Uid": "teacher-b" },
      }),
      action,
    );
    expect(response.status).toBe(401);
    expect(action).not.toHaveBeenCalled();
  });
});
