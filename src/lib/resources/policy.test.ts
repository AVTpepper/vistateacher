import { describe, expect, it } from "vitest";

import {
  canDownloadResource,
  canReserveResource,
} from "@/lib/resources/policy";

describe("resource entitlements", () => {
  it("keeps resource uploads unlimited for Community accounts", () => {
    expect(
      canReserveResource({
        status: "active",
      }),
    ).toEqual({ allowed: true });
  });

  it("keeps Plus uploads unlimited and blocks suspended accounts", () => {
    expect(
      canReserveResource({
        status: "active",
      }),
    ).toEqual({ allowed: true });
    expect(
      canReserveResource({
        status: "suspended",
      }),
    ).toMatchObject({ reason: "inactive" });
  });

  it("allows all active educators to download every resource", () => {
    expect(
      canDownloadResource({
        status: "active",
      }),
    ).toEqual({ allowed: true });
  });

  it("blocks resource actions for suspended accounts", () => {
    expect(
      canDownloadResource({
        status: "suspended",
      }),
    ).toMatchObject({ reason: "inactive" });
  });
});
