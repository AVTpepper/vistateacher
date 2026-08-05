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

  await expect(page.getByRole("tab", { name: "All Posts" })).toBeVisible();
  await expectNoPageOverflow(page);
  await expect(
    page.getByRole("link", { name: "Compare plans" }),
  ).toHaveAttribute("href", "/settings/billing");
  await expect(
    page.getByRole("link", { name: "Help & feedback" }),
  ).toHaveAttribute("href", "/support");
  await expect(
    page.getByRole("link", { name: "About & policies" }),
  ).toHaveAttribute("href", "/information");

  await page.goto("/pricing");
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
  await expect(page.getByLabel("Name")).toHaveValue("Alex Morgan");
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

test("keeps the short desktop sidebar scrollable without a visible scrollbar", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.setViewportSize({ width: 1100, height: 600 });
  await signIn(page, "community@vista.local");

  const navigation = page.getByRole("navigation", {
    name: "Platform navigation",
  });
  await expect(navigation).toBeVisible();
  expect(
    await navigation.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  expect(
    await navigation.evaluate(
      (element) => getComputedStyle(element).scrollbarWidth,
    ),
  ).toBe("none");
  await navigation.hover();
  await page.mouse.wheel(0, 600);
  await expect(
    page.getByRole("link", { name: "About & policies" }),
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
