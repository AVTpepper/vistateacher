import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/pricing", "/sign-in"];

test("passes WCAG A and AA checks on core public templates", async ({
  page,
}) => {
  for (const route of publicRoutes) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations, `${route} accessibility violations`).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `${route} horizontal overflow`,
    ).toBe(true);
  }
});

test("publishes canonical SEO metadata and release security headers", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");

  for (const route of [
    "/",
    "/about",
    "/pricing",
    "/help",
    "/privacy",
    "/terms",
  ]) {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} response`).toBe(true);
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical, `${route} canonical`).not.toBeNull();
    expect(new URL(canonical!).pathname).toBe(route);
  }

  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers["content-security-policy"]).toContain(
    "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  );
  expect(headers["content-security-policy"]).toContain(
    "connect-src 'self' https://*.googleapis.com",
  );
  expect(headers["content-security-policy"]).toContain(
    "https://checkout.stripe.com",
  );
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");

  const robots = await page.request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  await expect(robots.text()).resolves.toContain("Sitemap:");
  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  await expect(sitemap.text()).resolves.toContain("/pricing");
});

test("loads the production experience without failed same-origin assets", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("requestfailed", (request) => {
    if (
      new URL(request.url()).origin === "http://127.0.0.1:3100" &&
      request.failure()?.errorText !== "net::ERR_ABORTED"
    )
      failures.push(request.url());
  });

  await page.goto("/");
  await expect(page.getByAltText("A bright, active classroom")).toBeVisible();
  await expect(
    page.getByAltText("A bright, active classroom"),
  ).toHaveJSProperty("complete", true);
  expect(failures).toEqual([]);
});
