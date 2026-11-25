import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const phase = process.argv[2] ?? "before";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const output = `docs/audit/evidence/${phase}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
const report = {
  phase,
  capturedAt: new Date().toISOString(),
  baseURL,
  pages: [],
};
const publicRoutes = ["/", "/pricing", "/sign-in", "/sign-up", "/help"];
const privateRoutes = [
  "/app",
  "/discover",
  "/network",
  "/forum",
  "/messages",
  "/messages/new",
  "/notifications",
  "/resources",
  "/ai-lessons",
  "/dashboard",
  "/profile",
  "/settings/profile",
  "/settings/security",
  "/settings/billing",
  ...(phase === "after"
    ? [
        "/settings",
        "/resources/new",
        "/forum/new",
        "/resources/demo-resource",
        "/forum/demo-thread",
        "/post/demo-post",
        "/lessons/demo-lesson",
      ]
    : []),
];

try {
  for (const [device, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ baseURL, viewport });
    const page = await context.newPage();
    let errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    async function capture(route) {
      errors = [];
      const response = await page.goto(route);
      await page.locator("h1").first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(500);
      await page.evaluate(() => document.fonts.ready);
      const filename = `${device}-${route.replace(/^\//, "").replaceAll("/", "-") || "home"}.png`;
      await page.screenshot({ path: `${output}/${filename}`, fullPage: true });
      const inspection = await page.evaluate(() => ({
        title: document.title,
        heading: document.querySelector("h1")?.textContent?.trim(),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        links: Array.from(document.querySelectorAll("a[href]")).map((a) => ({
          label: a.textContent?.trim() || a.getAttribute("aria-label"),
          href: a.getAttribute("href"),
          visible:
            a.getBoundingClientRect().width > 0 &&
            a.getBoundingClientRect().height > 0,
        })),
        buttons: Array.from(document.querySelectorAll("button")).flatMap(
          (button) => {
            const rect = button.getBoundingClientRect();
            if (!rect.width || !rect.height) return [];
            const css = getComputedStyle(button);
            return [
              {
                label:
                  button.getAttribute("aria-label") ||
                  button.textContent?.trim(),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                fontSize: css.fontSize,
                radius: css.borderRadius,
                background: css.backgroundColor,
                disabled: button.disabled,
              },
            ];
          },
        ),
      }));
      let accessibility = null;
      if (
        ["/app", "/ai-lessons", "/pricing", "/notifications"].includes(route)
      ) {
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        accessibility = axe.violations.map(
          ({ id, impact, description, nodes }) => ({
            id,
            impact,
            description,
            nodes: nodes.map(({ target, failureSummary }) => ({
              target,
              failureSummary,
            })),
          }),
        );
      }
      report.pages.push({
        route,
        device,
        viewport,
        status: response?.status(),
        finalURL: page.url(),
        screenshot: filename,
        errors: [...errors],
        ...inspection,
        accessibility,
      });
      await writeFile(`${output}/audit.json`, JSON.stringify(report, null, 2));
      console.log(
        `${phase} ${device} ${route}: ${response?.status()} | ${inspection.heading ?? "no h1"} | errors=${errors.length}`,
      );
    }
    for (const route of publicRoutes) await capture(route);
    await page.goto("/sign-in");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("community@vista.local");
    await page.getByLabel("Password", { exact: true }).fill("VistaTeacher1!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/(app|dashboard|onboarding)/, { timeout: 45000 });
    for (const route of privateRoutes) await capture(route);
    await context.close();
  }
} finally {
  await writeFile(`${output}/audit.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
