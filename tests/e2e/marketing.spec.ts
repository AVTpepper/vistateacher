import { expect, test } from "@playwright/test";

test("renders the VistaTeacher marketing foundation", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "The network built for teachers." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await expect(page.getByAltText("A bright, active classroom")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Join free today" }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/VistaTeacher/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .getByAltText("A bright, active classroom")
      .evaluate((image: HTMLImageElement) => image.naturalWidth > 0),
  ).toBe(true);

  await expect(
    page.getByRole("link", { name: "Pricing" }).first(),
  ).toHaveAttribute("href", "/pricing");
  await page.goto("/pricing");
  await expect(
    page.getByRole("heading", {
      name: "Begin with community. Add Plus for deeper tools.",
    }),
  ).toBeVisible();
  await expect(page.getByText("$9")).toBeVisible();
});

test("protects the platform shell without a server session", async ({
  page,
}) => {
  for (const path of ["/app", "/discover", "/network"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  }
});

test("exposes accessible account entry and recovery routes", async ({
  page,
}) => {
  await page.goto("/sign-in");

  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  await expect(
    page.getByRole("link", { name: "Forgot password?" }),
  ).toHaveAttribute("href", "/forgot-password");
  await page.goto("/forgot-password");
  await expect(
    page.getByRole("heading", { name: "Reset your password" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
});

test("publishes help and legal pages", async ({ page }) => {
  await page.goto("/help");
  await expect(
    page.getByRole("heading", { name: "Answers for getting started." }),
  ).toBeVisible();

  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "Privacy Policy" }),
  ).toBeVisible();

  await page.goto("/terms");
  await expect(
    page.getByRole("heading", { name: "Terms of Service" }),
  ).toBeVisible();
});
