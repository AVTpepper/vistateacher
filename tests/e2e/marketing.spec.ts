import { expect, test } from "@playwright/test";

test("renders the VistaTeacher marketing foundation", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Find your people in education." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await expect(page.getByAltText("A bright, active classroom")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create account" }).first(),
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
  await expect(page.getByText("$9 / month", { exact: true })).toBeVisible();

  const plusPlan = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Plus", exact: true }) });
  await expect(
    plusPlan.getByRole("link", { name: "Choose Plus" }),
  ).toHaveAttribute("href", "/sign-up?plan=plus&interval=month");

  await plusPlan.getByRole("link", { name: "Choose Plus" }).click();
  await expect(page).toHaveURL(/\/sign-up\?plan=plus&interval=month$/);
  await expect(
    page.getByText(
      "Create your educator account to continue with VistaTeacher Plus.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }).last(),
  ).toHaveAttribute("href", "/sign-in?plan=plus&interval=month");
});

test("opens the marketing navigation on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const menuButton = page.getByRole("button", { name: "Open main menu" });
  const mainNavigation = page.getByRole("navigation", {
    name: "Main navigation",
  });

  await expect(menuButton).toBeVisible();
  await expect(
    mainNavigation.getByRole("link", { name: "About" }),
  ).toBeHidden();
  await expect(
    mainNavigation.getByRole("link", { name: "Create account" }),
  ).toBeHidden();

  await page.evaluate(() => window.scrollTo(0, 500));
  await expect
    .poll(() =>
      page
        .getByRole("banner")
        .evaluate((header) => Math.round(header.getBoundingClientRect().top)),
    )
    .toBe(0);
  const scrollPosition = await page.evaluate(() => window.scrollY);

  await menuButton.click();

  await expect(
    page.getByRole("button", { name: "Close main menu" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    mainNavigation.getByRole("link", { name: "About" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("#mobile-navigation")
        .evaluate((menu) => Math.round(menu.getBoundingClientRect().top)),
    )
    .toBe(64);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollPosition);
  await expect(page.locator("#mobile-navigation")).toHaveCSS(
    "max-width",
    "320px",
  );
  await expect(page.locator("#mobile-navigation")).toHaveCSS(
    "max-height",
    "780px",
  );
  expect(
    await page
      .locator("#mobile-navigation")
      .evaluate((menu) => menu.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(320);
  expect(
    await page
      .locator("#mobile-navigation")
      .evaluate((menu) => menu.getBoundingClientRect().height),
  ).toBeLessThan(844 - 64);
  await expect(
    mainNavigation.getByRole("link", { name: "Create account" }),
  ).toBeVisible();
  const mobileSignIn = mainNavigation.getByRole("link", {
    name: "Sign in",
    exact: true,
  });
  await expect(mobileSignIn).toBeVisible();
  await expect(mobileSignIn).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(mobileSignIn).toHaveCSS("border-top-style", "solid");
  expect(
    await mobileSignIn.evaluate((link) => link.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44);
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");

  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("button", { name: "Open main menu" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    mainNavigation.getByRole("link", { name: "About" }),
  ).toBeHidden();
  await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");

  await menuButton.click();

  await mainNavigation.getByRole("link", { name: "About" }).click();

  await expect(page).toHaveURL(/\/about$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Open main menu" }),
  ).toHaveAttribute("aria-expanded", "false");
});

test("protects the platform shell without a server session", async ({
  page,
}) => {
  for (const path of [
    "/app",
    "/discover",
    "/network",
    "/settings/billing/checkout?interval=month",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(path);
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
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();

  await expect(
    page.getByRole("link", { name: "Forgot password?" }),
  ).toHaveAttribute("href", "/forgot-password");
  await page.goto("/forgot-password");
  await expect(
    page.getByRole("heading", { name: "Reset your password" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();

  await page.goto("/sign-up");
  await expect(
    page.getByRole("button", { name: "Show password" }),
  ).toBeVisible();
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

  await page.goto("/cookies");
  await expect(
    page.getByRole("heading", { name: "Cookie Policy" }),
  ).toBeVisible();

  await page.goto("/terms");
  await expect(
    page.getByRole("heading", { name: "Terms of Service" }),
  ).toBeVisible();
});
