import { describe, expect, it } from "vitest";

import {
  isAllowedRequestOrigin,
  isRecentAuthentication,
  MAX_AUTH_AGE_SECONDS,
} from "@/lib/auth/policy";
import { onboardingSchema } from "@/schemas/auth";

describe("authentication policy", () => {
  it("accepts only fresh, non-future authentication times", () => {
    expect(isRecentAuthentication(1_000, 1_000 + MAX_AUTH_AGE_SECONDS)).toBe(
      true,
    );
    expect(isRecentAuthentication(1_000, 1_001 + MAX_AUTH_AGE_SECONDS)).toBe(
      false,
    );
    expect(isRecentAuthentication(1_001, 1_000)).toBe(false);
  });

  it("requires the configured application origin", () => {
    expect(
      isAllowedRequestOrigin(
        "https://vista.example",
        "https://vista.example/path",
      ),
    ).toBe(true);
    expect(
      isAllowedRequestOrigin(
        "https://malicious.example",
        "https://vista.example",
      ),
    ).toBe(false);
    expect(isAllowedRequestOrigin(null, "https://vista.example")).toBe(false);
  });
});

describe("onboarding schema", () => {
  const validInput = {
    displayName: "Ada Teacher",
    gradeLevel: "Middle School",
    subjects: ["Science"],
    country: "United States",
    city: "Portland",
    school: "Cedar Grove School",
    yearsOfExperience: 8,
    bio: "I teach inquiry-led science.",
    interests: ["Student voice"],
  };

  it("accepts a bounded educator profile", () => {
    expect(onboardingSchema.parse(validInput)).toEqual(validInput);
  });

  it("rejects missing subjects and unrealistic experience", () => {
    expect(
      onboardingSchema.safeParse({
        ...validInput,
        subjects: [],
        yearsOfExperience: 99,
      }).success,
    ).toBe(false);
  });
});
