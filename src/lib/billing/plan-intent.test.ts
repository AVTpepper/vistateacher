import { describe, expect, it } from "vitest";

import { parsePlanIntent, planIntentHref } from "./plan-intent";

describe("billing plan intent", () => {
  it("accepts only the supported Plus intent", () => {
    expect(parsePlanIntent("plus")).toBe("plus");
    expect(parsePlanIntent("free")).toBeNull();
    expect(parsePlanIntent(["plus"])).toBeNull();
    expect(parsePlanIntent(undefined)).toBeNull();
  });

  it("preserves Plus intent on a local destination", () => {
    expect(planIntentHref("/sign-in", "plus")).toBe("/sign-in?plan=plus");
    expect(planIntentHref("/sign-in", null)).toBe("/sign-in");
  });
});