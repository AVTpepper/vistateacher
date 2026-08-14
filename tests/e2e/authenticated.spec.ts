import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string) {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.push(error.message));
  page.on("requestfailed", (request) =>
    diagnostics.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`,
    ),
  );
  page.on("response", (response) => {
    if (response.status() >= 400)
      diagnostics.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("VistaTeacher1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  try {
    await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  } catch (error) {
    throw new Error(
      `${String(error)}\nBrowser diagnostics:\n${diagnostics.join("\n") || "none"}`,
    );
  }
}

async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("signs in a seeded educator and protects platform workflows", async ({
  page,
}) => {
  await signIn(page, "community@vista.local");

  await expect(page.getByRole("button", { name: "All Posts" })).toBeVisible();
  await expectNoPageOverflow(page);
  const mobileMenu = page.getByRole("button", { name: "Open menu" });
  if (await mobileMenu.isVisible()) {
    await mobileMenu.click();
    const navigation = page
      .getByLabel("Platform menu")
      .getByRole("navigation", { name: "Platform navigation" });
    await expect(navigation.getByRole("link", { name: "Feed" })).toBeVisible();
    await expect(
      navigation.getByRole("link", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(
      navigation.getByRole("link", { name: "Help & feedback" }),
    ).toHaveCount(0);
    await expect(
      navigation.getByRole("link", { name: "About & policies" }),
    ).toHaveCount(0);
    await expect(
      navigation.getByRole("link", { name: "Settings" }),
    ).toHaveCount(0);
    await expect(
      navigation.getByRole("button", { name: "Log out" }),
    ).toHaveCount(0);
  } else {
    const footerNavigation = page.getByLabel("Platform footer navigation");
    await expect(
      footerNavigation.getByRole("link", { name: "Compare plans" }),
    ).toHaveAttribute("href", "/settings/billing");
    await expect(
      footerNavigation.getByRole("link", { name: "Help & feedback" }),
    ).toHaveAttribute("href", "/support");
    await expect(
      footerNavigation.getByRole("link", { name: "About & policies" }),
    ).toHaveAttribute("href", "/information");
  }

  await page.goto("/pricing");
  const marketingMenu = page.getByRole("button", { name: "Open main menu" });
  if (await marketingMenu.isVisible()) await marketingMenu.click();
  await expect(
    page.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveAttribute("href", "/app");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveCount(0);

  await page.goto("/information");
  await expect(
    page.getByRole("heading", { name: "About & policies" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Privacy policy/ }),
  ).toHaveAttribute("href", "/privacy");
  await expect(
    page.getByRole("link", { name: /Contact and feedback/ }),
  ).toHaveAttribute("href", "/support");
  await expectNoPageOverflow(page);

  await page.goto("/settings/billing");
  await expect(
    page.getByRole("heading", { name: "Stripe test mode" }),
  ).toBeVisible();
  await expect(page.getByText("4242 4242 4242 4242")).toBeVisible();
  await expect(page.getByText("$0 membership fee")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Choose the access that fits your work",
    }),
  ).toBeVisible();
  await expectNoPageOverflow(page);

  await page.goto("/support");
  await expect(
    page.getByRole("heading", { name: "Help & feedback" }),
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Alex Rivera");
  await expect(page.getByLabel("Email")).toHaveValue("community@vista.local");
  await expectNoPageOverflow(page);

  await page.goto("/resources");
  await expect(
    page.getByRole("heading", { name: "Resources", exact: true }),
  ).toBeVisible();
  await expectNoPageOverflow(page);

  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Welcome back, Alex." }),
  ).toBeVisible();
  await expectNoPageOverflow(page);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app$/);
});

test("keeps authenticated educator routes responsive and accessible", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, "community@vista.local");

  const routes = [
    "/app",
    "/dashboard",
    "/discover",
    "/network?view=followers",
    "/network?view=following",
    "/network?view=suggestions",
    "/forum",
    "/forum/demo-thread",
    "/messages",
    "/notifications",
    "/resources",
    "/resources/demo-resource",
    "/ai-lessons",
    "/profile",
    "/profile/plus-educator",
    "/settings",
    "/settings/profile",
    "/settings/billing",
    "/support",
    "/information",
  ];

  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} response`).toBe(true);
    await expectNoPageOverflow(page);
    await expect(page.locator("main")).toHaveCount(1);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations, `${route} accessibility violations`).toEqual([]);
  }
});

test("previews and manages contextual notifications", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await signIn(page, "community@vista.local");

  await page
    .getByRole("button", { name: /^Notifications(?:, \d+ unread)?$/ })
    .click();
  const menu = page.getByLabel("Recent notifications");
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("link", { name: /Jordan Okafor followed you/ }),
  ).toHaveAttribute("href", "/profile/educator-three");
  await menu
    .getByRole("button", { name: /Mark as read: Jordan Okafor followed you/ })
    .click();
  await menu.getByRole("link", { name: "View all notifications" }).click();
  await expect(page).toHaveURL(/\/notifications$/);

  const notification = page
    .getByRole("article")
    .filter({ hasText: "Jordan Okafor followed you." });
  await notification.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Archived" }).click();
  await expect(notification).toBeVisible();
  await notification.getByRole("button", { name: "Restore" }).click();

  await page.getByRole("button", { name: "All", exact: true }).click();
  await notification.getByRole("button", { name: "Mark as unread" }).click();
  await expect(
    notification.getByRole("button", { name: "Mark as read" }),
  ).toBeVisible();
  await notification.getByRole("button", { name: "Delete" }).click();
  await expect(notification).toHaveCount(0);
});

test("keeps administration routes responsive and accessible", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page, "admin@vista.local");

  for (const route of [
    "/admin",
    "/admin/users",
    "/admin/content",
    "/admin/reports",
    "/admin/verification",
  ]) {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} response`).toBe(true);
    await expectNoPageOverflow(page);
    await expect(page.locator("main")).toHaveCount(1);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations, `${route} accessibility violations`).toEqual([]);
  }
});

test("keeps desktop platform navigation complete and within the viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.setViewportSize({ width: 1100, height: 600 });
  await signIn(page, "community@vista.local");

  const navigation = page.getByRole("navigation", {
    name: "Primary platform navigation",
  });
  await expect(navigation).toBeVisible();
  expect(
    await navigation.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  for (const label of [
    "Feed",
    "Discover",
    "Network",
    "Resources",
    "Forum",
    "AI Lesson Builder",
    "Messages",
    "Dashboard",
  ]) {
    await expect(navigation.getByRole("link", { name: label })).toBeVisible();
  }

  await page.getByRole("button", { name: "Open profile menu" }).click();
  const profileNavigation = page.getByLabel("Profile navigation");
  await expect(
    profileNavigation.getByRole("link", { name: "Settings" }),
  ).toBeVisible();
  await expect(
    profileNavigation.getByRole("button", { name: "Log out" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  const footerNavigation = page.getByLabel("Platform footer navigation");
  await footerNavigation.scrollIntoViewIfNeeded();
  await expect(
    footerNavigation.getByRole("link", { name: "About & policies" }),
  ).toBeVisible();
});

test("lets a platform administrator resolve and audit a report", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await signIn(page, "admin@vista.local");

  await page.goto("/admin/reports");
  await expect(
    page.getByRole("heading", { name: "Administration" }),
  ).toBeVisible();
  const report = page.getByRole("row").filter({ hasText: "demo-post" });
  await report.getByRole("button", { name: "Resolve" }).click();
  await page
    .getByLabel("Reason")
    .fill("Confirmed by the Phase 12 release workflow.");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(report.getByText("resolved", { exact: true })).toBeVisible();

  await page.goto("/admin");
  await expect(
    page.getByText("Confirmed by the Phase 12 release workflow."),
  ).toBeVisible();
  await expectNoPageOverflow(page);
});
