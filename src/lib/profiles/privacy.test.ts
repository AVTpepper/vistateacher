import { describe, expect, it } from "vitest";

import { canViewContactDetails } from "@/lib/profiles/privacy";

describe("profile contact visibility", () => {
  it("always allows the profile owner", () => {
    expect(canViewContactDetails("owner", "owner", false)).toBe(true);
  });

  it("requires explicit sharing for other viewers", () => {
    expect(canViewContactDetails("owner", "viewer", false)).toBe(false);
    expect(canViewContactDetails("owner", null, false)).toBe(false);
    expect(canViewContactDetails("owner", "viewer", true)).toBe(true);
    expect(canViewContactDetails("owner", null, true)).toBe(true);
  });
});
