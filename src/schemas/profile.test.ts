import { describe, expect, it } from "vitest";

import {
  deletionRequestSchema,
  privateSettingsSchema,
  profileUpdateSchema,
} from "@/schemas/profile";

const profile = {
  displayName: "Sarah Mitchell",
  gradeLevel: "Elementary",
  subjects: ["Mathematics"],
  country: "United States",
  city: "Austin",
  school: "Lincoln Elementary",
  yearsOfExperience: 12,
  bio: "Making mathematics accessible and joyful.",
  website: "sarah.example",
  interests: ["Curriculum design"],
};

describe("profile contracts", () => {
  it("normalizes a valid website", () => {
    expect(profileUpdateSchema.parse(profile).website).toBe(
      "https://sarah.example",
    );
  });

  it("rejects unbounded subjects and malformed websites", () => {
    expect(
      profileUpdateSchema.safeParse({ ...profile, subjects: [] }).success,
    ).toBe(false);
    expect(
      profileUpdateSchema.safeParse({ ...profile, website: "not a url" })
        .success,
    ).toBe(false);
  });

  it("keeps contact sharing opt-in", () => {
    const result = privateSettingsSchema.parse({
      contactDetails: { professionalEmail: "", phone: "" },
      privacySettings: { shareContactInfo: false },
      notificationSettings: { email: true, inApp: true },
    });
    expect(result.privacySettings.shareContactInfo).toBe(false);
  });

  it("requires explicit account deletion confirmation", () => {
    expect(
      deletionRequestSchema.safeParse({ confirmation: "delete" }).success,
    ).toBe(false);
    expect(
      deletionRequestSchema.safeParse({ confirmation: "DELETE" }).success,
    ).toBe(true);
  });
});
