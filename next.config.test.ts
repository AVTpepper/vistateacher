import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("public route compatibility", () => {
  it("redirects known legacy routes to their current destinations", async () => {
    expect(nextConfig.redirects).toBeTypeOf("function");
    const redirects = await nextConfig.redirects!();

    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: "/home", destination: "/", permanent: true },
        { source: "/educators", destination: "/discover", permanent: true },
        {
          source: "/lesson-builder",
          destination: "/ai-lessons",
          permanent: true,
        },
        { source: "/contact", destination: "/support", permanent: true },
      ]),
    );
  });
});
