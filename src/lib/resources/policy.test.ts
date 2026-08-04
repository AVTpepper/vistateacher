import { describe, expect, it } from "vitest";

import {
  canDownloadResource,
  canReserveResource,
} from "@/lib/resources/policy";

describe("resource entitlements", () => {
  it("allows four Free uploads and stops the sixth reservation", () => {
    expect(
      canReserveResource({
        status: "active",
        plan: "free",
        uploadsThisMonth: 4,
      }),
    ).toEqual({ allowed: true });
    expect(
      canReserveResource({
        status: "active",
        plan: "free",
        uploadsThisMonth: 5,
      }),
    ).toMatchObject({ reason: "limit-reached" });
  });

  it("keeps Plus uploads unlimited and blocks suspended accounts", () => {
    expect(
      canReserveResource({
        status: "active",
        plan: "plus",
        uploadsThisMonth: 10_000,
      }),
    ).toEqual({ allowed: true });
    expect(
      canReserveResource({
        status: "suspended",
        plan: "plus",
        uploadsThisMonth: 0,
      }),
    ).toMatchObject({ reason: "inactive" });
  });

  it("requires Plus for restricted downloads but always permits the owner", () => {
    expect(
      canDownloadResource({
        status: "active",
        plan: "free",
        accessTier: "plus",
        ownsResource: false,
      }),
    ).toMatchObject({ reason: "plus-required" });
    expect(
      canDownloadResource({
        status: "active",
        plan: "free",
        accessTier: "plus",
        ownsResource: true,
      }),
    ).toEqual({ allowed: true });
  });
});
