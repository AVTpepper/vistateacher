import { afterEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

function makeRequest(headers: Record<string, string>): NextRequest {
  return {
    headers: new Headers(headers),
  } as NextRequest;
}

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
});

describe("hasTrustedOrigin", () => {
  it("accepts production requests when origin host matches host", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://stale-hosted-app.web.app";

    const trusted = hasTrustedOrigin(
      makeRequest({
        origin: "https://vistateacher.com",
        host: "vistateacher.com",
      }),
    );

    expect(trusted).toBe(true);
  });

  it("accepts production requests when origin host matches x-forwarded-host", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://stale-hosted-app.web.app";

    const trusted = hasTrustedOrigin(
      makeRequest({
        origin: "https://vistateacher.com",
        host: "internal-service",
        "x-forwarded-host": "vistateacher.com, internal-service",
      }),
    );

    expect(trusted).toBe(true);
  });

  it("rejects cross-origin requests", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://vistateacher.com";

    const trusted = hasTrustedOrigin(
      makeRequest({
        origin: "https://malicious.example",
        host: "vistateacher.com",
      }),
    );

    expect(trusted).toBe(false);
  });

  it("falls back to configured app URL matching", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://vistateacher.com";

    const trusted = hasTrustedOrigin(
      makeRequest({
        origin: "https://vistateacher.com",
      }),
    );

    expect(trusted).toBe(true);
  });
});
