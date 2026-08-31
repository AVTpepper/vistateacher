import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("VistaTeacher1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
}

async function expectDialogInsideViewport(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return (
        bounds.top >= 0 &&
        bounds.left >= 0 &&
        bounds.right <= window.innerWidth &&
        bounds.bottom <= window.innerHeight
      );
    }),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("publishes content-aware titles for authenticated detail routes", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await signIn(page, "community@vista.local");

  for (const [route, title] of [
    [
      "/post/demo-post",
      "What routines help students make their thinking visible? | VistaTeacher",
    ],
    [
      "/forum/demo-thread",
      "How do you structure student-led discussion? | VistaTeacher",
    ],
    ["/profile/free-educator", "Alex Rivera | VistaTeacher"],
    ["/resources/demo-resource", "Ecosystem Notice and Wonder | VistaTeacher"],
  ] as const) {
    await page.goto(route);
    await expect(page).toHaveTitle(title);
  }
});

test("edits an owned forum reply and preserves errors in the dialog", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await signIn(page, "community@vista.local");
  await page.goto("/forum/demo-thread");

  await page.getByRole("button", { name: "Edit comment" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Edit comment" });
  await dialog
    .getByRole("textbox", { name: "Comment" })
    .fill("Updated forum reply for release.");
  await page.route(
    "**/api/forum/demo-thread/replies/demo-reply",
    async (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Forum edit temporarily unavailable." }),
      }),
    { times: 1 },
  );
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Forum edit temporarily unavailable.",
  );
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Updated forum reply for release."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Updated forum reply for release."),
  ).toBeVisible();
});

test("edits an owned discussion and resets a cancelled draft", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await signIn(page, "jordan@vista.local");
  await page.goto("/forum/demo-thread");

  await page.getByRole("button", { name: "Edit discussion" }).click();
  let dialog = page.getByRole("dialog", { name: "Edit discussion" });
  await dialog.getByLabel("Title").fill("Discarded discussion title");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Edit discussion" }).click();
  dialog = page.getByRole("dialog", { name: "Edit discussion" });
  await expect(dialog.getByLabel("Title")).not.toHaveValue(
    "Discarded discussion title",
  );
  await dialog
    .getByLabel("Title")
    .fill("How do you structure an inclusive discussion?");
  await dialog
    .getByLabel("Content")
    .fill("Share an inclusive routine that gives every learner a way in.");
  await dialog.getByLabel("Tags").fill("discussion, inclusion");
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", {
      name: "How do you structure an inclusive discussion?",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveTitle(
    "How do you structure an inclusive discussion? | VistaTeacher",
  );
});

test("edits resource metadata and messages with recoverable failures", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await signIn(page, "plus@vista.local");

  await page.goto("/resources/demo-resource");
  await page.getByRole("button", { name: "Edit Metadata" }).click();
  let dialog = page.getByRole("dialog", { name: "Edit resource" });
  await dialog.getByLabel("Title").fill("");
  await expect(
    dialog.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await dialog.getByLabel("Title").fill("Ecosystem Discussion Organizer");
  await page.route(
    "**/api/resources/demo-resource",
    async (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Resource edit temporarily unavailable.",
        }),
      }),
    { times: 1 },
  );
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Resource edit temporarily unavailable.",
  );
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Resource updated.")).toBeVisible();
  await page.reload();
  await expect(page).toHaveTitle(
    "Ecosystem Discussion Organizer | VistaTeacher",
  );

  await page.goto("/messages?conversation=free-educator_plus-educator");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit message" });
  await dialog
    .getByRole("textbox", { name: "Message" })
    .fill("Updated organizer message.");
  await page.route(
    "**/api/messages/free-educator_plus-educator/demo-message",
    async (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Message edit temporarily unavailable.",
        }),
      }),
    { times: 1 },
  );
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Message edit temporarily unavailable.",
  );
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByLabel("Conversation with Alex Rivera")
      .getByText("Updated organizer message.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByLabel("Conversation with Alex Rivera")
      .getByText("Updated organizer message.", { exact: true }),
  ).toBeVisible();
});

test("recovers from embedded checkout initialization failures", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await signIn(page, "community@vista.local");
  let attempt = 0;
  await page.route("**/api/billing/checkout", async (route) => {
    attempt += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error:
          attempt === 1
            ? "Checkout initialization failed."
            : "Checkout retry failed safely.",
      }),
    });
  });

  await page.goto("/settings/billing/checkout?interval=month");
  await expect(page.getByText("Stripe test mode")).toBeVisible();
  const checkoutAlert = page
    .getByRole("alert")
    .filter({ hasText: "Checkout couldn't load" });
  await expect(checkoutAlert).toContainText("Checkout initialization failed.");
  await page.getByRole("button", { name: "Retry checkout" }).click();
  await expect(checkoutAlert).toContainText("Checkout retry failed safely.");
  await expect(
    page.getByRole("link", { name: "Back to plans" }),
  ).toHaveAttribute("href", "/settings/billing");
});

test("keeps edit dialogs usable inside the mobile visual viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome");
  await signIn(page, "plus@vista.local");

  await page.goto("/resources/demo-resource");
  await page.getByRole("button", { name: "Edit Metadata" }).click();
  await expectDialogInsideViewport(page);
  await expect(page.getByLabel("Title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto("/messages?conversation=free-educator_plus-educator");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expectDialogInsideViewport(page);
  await expect(
    page
      .getByRole("dialog", { name: "Edit message" })
      .getByRole("textbox", { name: "Message" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Close edit message" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});
