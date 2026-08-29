import { describe, expect, it } from "vitest";

import { parsePlanIntent, planIntentHref } from "./plan-intent";

describe("billing plan intent", () => {
  it("accepts only the supported Plus intent", () => {
    expect(parsePlanIntent("plus")).toEqual({
      plan: "plus",
      interval: "month",
    });
    expect(parsePlanIntent("plus", "year")).toEqual({
      plan: "plus",
      interval: "year",
    });
    expect(parsePlanIntent("free")).toBeNull();
    expect(parsePlanIntent(["plus"])).toBeNull();
    expect(parsePlanIntent(undefined)).toBeNull();
  });

  it("preserves Plus intent on a local destination", () => {
    expect(planIntentHref("/sign-in", { plan: "plus", interval: "year" })).toBe(
      "/sign-in?plan=plus&interval=year",
    );
    expect(planIntentHref("/sign-in", null)).toBe("/sign-in");
  });
});
