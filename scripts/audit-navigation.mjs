import { readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const inventories = await Promise.all(
  ["before", "after"].map(async (phase) =>
    JSON.parse(
      await readFile(`docs/audit/evidence/${phase}/audit.json`, "utf8"),
    ),
  ),
);
const historicalRoutes = [
  ...new Set(
    inventories
      .flatMap((inventory) => inventory.pages)
      .flatMap((page) => page.links.map((link) => link.href))
      .filter((href) => href?.startsWith("/") && !href.startsWith("//"))
      .concat(["/worksheets", "/worksheets/new"]),
  ),
];
const isTemporaryProfile = (href) =>
  /^\/profile\/(?:launch|worksheet)-[a-f0-9-]{36}$/.test(href);
const routes = new Set(
  historicalRoutes.filter((href) => !isTemporaryProfile(href)),
);
const browser = await chromium.launch();
const report = {
  capturedAt: new Date().toISOString(),
  baseURL,
  targets: [],
  journeys: [],
  currentPages: [],
  historicalFixtures: [],
};
try {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("community@vista.local");
  await page.getByLabel("Password", { exact: true }).fill("VistaTeacher1!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/app$/);
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const label of [
      "Dashboard",
      "Feed",
      "Discover",
      "Network",
      "Forum",
      "Messages",
      "Resources",
      "Lessons",
      "Worksheets",
    ]) {
      try {
        if (width < 1024)
          await page
            .getByRole("button", { name: "Open menu", exact: true })
            .click();
        const nav = page.getByRole("navigation", {
          name:
            width < 1024
              ? "Platform navigation"
              : "Primary platform navigation",
          exact: true,
        });
        const link = nav.getByRole("link", { name: label, exact: true });
        const href = await link.getAttribute("href");
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${href}$`));
        await expect(page.locator("h1").first()).toBeVisible();
        const links = await page
          .locator('a[href^="/"]')
          .evaluateAll((anchors) =>
            anchors
              .map((anchor) => anchor.getAttribute("href"))
              .filter((href) => href && !href.startsWith("//")),
          );
        links.forEach((href) => routes.add(href));
        report.currentPages.push({ width, href, links });
        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        );
        expect(overflows).toBe(false);
        if (width < 1024)
          await expect(
            page.getByRole("button", { name: "Open menu", exact: true }),
          ).toHaveAttribute("aria-expanded", "false");
        report.journeys.push({ width, label, href, pass: true });
      } catch (error) {
        report.journeys.push({
          width,
          label,
          pass: false,
          error: error.message,
        });
      }
    }
  }
  for (const href of routes) {
    try {
      const response = await context.request.get(href);
      report.targets.push({
        href,
        status: response.status(),
        finalURL: response.url(),
        pass: response.ok(),
      });
    } catch (error) {
      report.targets.push({ href, pass: false, error: error.message });
    }
  }
  for (const href of historicalRoutes.filter(
    (href) => isTemporaryProfile(href) && !routes.has(href),
  )) {
    const response = await context.request.get(href);
    report.historicalFixtures.push({
      href,
      status: response.status(),
      note: "Temporary profile from an earlier screenshot dataset; not linked by the current pages. Rule tests reset demo data.",
    });
  }
} finally {
  await writeFile(
    "docs/audit/evidence/navigation.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
console.log(
  JSON.stringify(
    {
      targets: report.targets.length,
      failedTargets: report.targets.filter((target) => !target.pass),
      journeys: report.journeys.length,
      failedJourneys: report.journeys.filter((journey) => !journey.pass),
      historicalFixtureTargets: report.historicalFixtures.length,
    },
    null,
    2,
  ),
);
if (
  report.targets.some((target) => !target.pass) ||
  report.journeys.some((journey) => !journey.pass)
)
  process.exitCode = 1;
