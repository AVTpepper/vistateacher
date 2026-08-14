import { describe, expect, it } from "vitest";

import { hrefWithReturnTo, safeReturnTo } from "@/lib/auth/return-to";

describe("safeReturnTo", () => {
  it("keeps same-origin application paths", () => {
    expect(safeReturnTo("/post/abc123?comments=1#reply")).toBe(
      "/post/abc123?comments=1#reply",
    );
    expect(hrefWithReturnTo("/sign-in?plan=plus", "/post/abc123")).toBe(
      "/sign-in?plan=plus&returnTo=%2Fpost%2Fabc123",
    );
  });

  it.each([
    "https://evil.example/post/abc123",
    "//evil.example/post/abc123",
    "/\\evil.example/post/abc123",
    "javascript:alert(1)",
    "post/abc123",
    "",
  ])("rejects unsafe destination %s", (value) => {
    expect(safeReturnTo(value)).toBeNull();
  });
});
