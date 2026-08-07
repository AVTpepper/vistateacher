import { describe, expect, it } from "vitest";

import { matchesDiscoveryFilters } from "@/lib/network/discovery-policy";
import type { ProfileDocument } from "@/schemas/profile";

const educator = {
  uid: "educator",
  displayName: "José Rivera",
  professionalRoles: ["Department or subject lead"],
  gradeLevel: "Middle School",
  subjects: ["Earth Science"],
  languages: ["Spanish"],
  country: "United States",
  city: "Portland",
  school: "Cedar Grove School",
  yearsOfExperience: 8,
  bio: "Project-based learning and student voice.",
  website: null,
  interests: ["Student Voice"],
  photoURL: null,
  coverImageURL: null,
  coverTheme: "burgundy-bloom",
  role: "educator",
  isVerified: true,
  connectionCount: 0,
  resourceCount: 0,
  postCount: 0,
  status: "active",
  createdAt: null,
  updatedAt: null,
} satisfies ProfileDocument;

const emptyFilters = {
  query: "",
  subject: "",
  grade: "",
  location: "",
  verified: false,
};

describe("educator discovery filters", () => {
  it("normalizes accents and case across professional fields", () => {
    expect(
      matchesDiscoveryFilters(educator, {
        ...emptyFilters,
        query: "jose rivera",
      }),
    ).toBe(true);
    expect(
      matchesDiscoveryFilters(educator, {
        ...emptyFilters,
        query: "department",
      }),
    ).toBe(true);
    expect(
      matchesDiscoveryFilters(educator, {
        ...emptyFilters,
        query: "spanish",
      }),
    ).toBe(true);
    expect(
      matchesDiscoveryFilters(educator, {
        ...emptyFilters,
        location: "PORTLAND united states",
      }),
    ).toBe(true);
  });

  it("combines subject, grade, and verification filters", () => {
    expect(
      matchesDiscoveryFilters(educator, {
        ...emptyFilters,
        subject: "earth science",
        grade: "middle school",
        verified: true,
      }),
    ).toBe(true);
    expect(
      matchesDiscoveryFilters(educator, {
        ...emptyFilters,
        subject: "Mathematics",
      }),
    ).toBe(false);
  });
});
