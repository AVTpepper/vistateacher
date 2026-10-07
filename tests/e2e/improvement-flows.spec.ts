import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email = "community@vista.local") {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("VistaTeacher1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
}

test("feed selection survives reload and browser history", async ({ page }) => {
  await signIn(page);
  await page.goto("/app?view=saved");
  const main = page.locator("main");
  await expect(
    main.getByRole("link", { name: "Saved", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(
    main.getByRole("link", { name: "Saved", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await main.getByRole("link", { name: "Connections feed" }).click();
  await expect(page).toHaveURL(/view=following$/);
  await page.goBack();
  await expect(
    main.getByRole("link", { name: "Saved", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("deleting a post from its permalink returns to the feed", async ({
  page,
}) => {
  await signIn(page);
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "post",
        content: "A post created to verify permalink deletion",
      }),
    });
    if (!response.ok) throw new Error("Could not create the test post");
    return (await response.json()) as { postId: string };
  });
  await page.goto(`/post/${result.postId}`);
  await page.getByRole("button", { name: "Post options" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto(`/post/${result.postId}`);
  // Next.js streams the authenticated layout before rendering its not-found boundary.
  await expect(
    page.getByRole("heading", { name: "Post unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText("A post created to verify permalink deletion"),
  ).toHaveCount(0);
});

test("account menus support keyboard navigation and security stays accessible on mobile", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.getByRole("button", { name: "Open profile menu" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menu", { name: "Profile navigation" }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  const logoutDialog = page.getByRole("alertdialog");
  await expect(logoutDialog).toBeVisible();
  await logoutDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(logoutDialog).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open profile menu" }),
  ).toBeFocused();
  await page.goto("/settings/security");
  await expect(page.getByLabel("New login email")).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("security.png"),
    fullPage: true,
  });
  await page.goto("/app");
  await page.screenshot({
    path: testInfo.outputPath("feed.png"),
    fullPage: true,
  });
});

test("a failed message deletion stays open and preserves the message", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.goto("/messages");
  await page
    .getByRole("button")
    .filter({ hasText: "Maya Chen" })
    .first()
    .click();
  const content = `Keep this message when deletion fails (${testInfo.project.name})`;
  await page.getByLabel("Message", { exact: true }).fill(content);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(content, { exact: true })).toBeVisible();
  await page.route("**/api/messages/*/*", async (route) => {
    if (route.request().method() === "DELETE")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unavailable" }),
      });
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "Delete", exact: true })
    .last()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "We couldn't delete that message.",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText(content, { exact: true })).toBeVisible();
});

test("a failed lesson deletion stays open and preserves the lesson", async ({
  page,
}) => {
  await signIn(page, "plus@vista.local");
  await page.goto("/ai-lessons");
  const trigger = page.getByRole("button", {
    name: "Delete Investigating Local Ecosystems",
    exact: true,
  });
  await expect(trigger).toBeVisible();
  await page.route("**/api/ai-lessons/*", async (route) => {
    if (route.request().method() === "DELETE")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unavailable" }),
      });
    else await route.continue();
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Delete failed.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(trigger).toBeVisible();
});
