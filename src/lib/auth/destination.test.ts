import { describe, expect, it } from "vitest";
import { authenticationDestination } from "./destination";

describe("authentication destinations", () => {
  it("lands in the community and rejects an external return URL", () => {
    expect(authenticationDestination("/app", null, null)).toBe("/app");
    expect(
      authenticationDestination("/app", "https://evil.example", null),
    ).toBe("/app");
  });

  it("restores a teaching material permalink ahead of a paid-plan intent", () => {
    expect(
      authenticationDestination("/app", "/lessons/abc?review=1", {
        plan: "plus",
        interval: "year",
      }),
    ).toBe("/lessons/abc?review=1");
  });

  it("continues paid-plan setup when no return destination was requested", () => {
    expect(
      authenticationDestination("/app", null, {
        plan: "plus",
        interval: "year",
      }),
    ).toBe("/settings/billing?plan=plus&interval=year");
  });

  it("requires onboarding first while retaining both intentions", () => {
    expect(
      authenticationDestination("/onboarding", "/post/classroom", {
        plan: "plus",
        interval: "month",
      }),
    ).toBe("/onboarding?plan=plus&interval=month&returnTo=%2Fpost%2Fclassroom");
  });
});
