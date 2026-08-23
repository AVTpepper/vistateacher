import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email = "community@vista.local") {
  await page.goto("/sign-in");
  const emailInput = page.getByLabel("Email address");
  await emailInput.pressSequentially(email);
  await expect(emailInput).toHaveValue(email);
  await page.getByLabel("Password", { exact: true }).fill("VistaTeacher1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
}

test("forum category URLs, validation, API errors, and creation remain stable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await signIn(page);
  await page.goto("/forum");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("link", { name: /Student Engagement/ }).click();
  await expect(page).toHaveURL(/\/forum\?category=student-engagement$/);
  const heading = page.getByRole("heading", {
    name: "Student Engagement",
    exact: true,
  });
  await expect(heading).toBeVisible();
  expect(
    await heading.evaluate((element) => element.getBoundingClientRect().top),
  ).toBeGreaterThanOrEqual(0);
  expect(
    await heading.evaluate((element) => element.getBoundingClientRect().top),
  ).toBeLessThan(500);
  await page.goBack();
  await expect(page).toHaveURL(/\/forum$/);
  await expect(
    page.getByRole("link", { name: /Student Engagement/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Start a new discussion" }).click();
  await page.getByRole("button", { name: "Post Discussion" }).click();
  await expect(
    page.getByText("Use at least 8 characters for the title."),
  ).toBeVisible();
  await expect(
    page.getByText("Use at least 20 characters for your post."),
  ).toBeVisible();
  await page.getByLabel("Title").fill("A useful discussion title");
  await page
    .getByLabel("Your post")
    .fill("This prompt contains enough detail for an educator discussion.");

  await page.route(
    "**/api/forum",
    async (route) => {
      if (route.request().method() === "POST")
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Forum service unavailable." }),
        });
      else await route.continue();
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Post Discussion" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Forum service unavailable." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Post Discussion" }).click();
  await expect(page).toHaveURL(/\/forum\/[^?]+$/, { timeout: 20_000 });
});

test("common and phone image resource uploads complete and the mobile dialog stays inside the viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await signIn(page);
  await page.goto("/resources");

  for (const file of [
    {
      name: "classroom.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    },
    {
      name: "classroom.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    },
    {
      name: "classroom.heic",
      mimeType: "image/heic",
      buffer: Buffer.from([0x00, 0x00, 0x00, 0x18]),
    },
  ]) {
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await page
      .getByRole("button", { name: "Upload Resource", exact: true })
      .click();
    await expect(
      page.getByText("Enter a title with at least 3 characters."),
    ).toBeVisible();
    await expect(page.getByText("Choose a file to upload.")).toBeVisible();
    await page.getByLabel("Resource title").fill(`Resource ${file.name}`);
    await page
      .getByRole("textbox", { name: "Description (required)", exact: true })
      .fill("A detailed classroom-ready visual resource.");
    await page.getByLabel("Subject").fill("Science");
    await page.getByLabel("Grade level").fill("Grade 6");
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText(file.name, { exact: true })).toBeVisible();
    await expect(
      page.getByText(new RegExp(`${file.mimeType}.*bytes`)),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Upload Resource", exact: true })
      .click();
    await expect(page.getByText("Resource published.").last()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Close toast" }).last().click();
  }
});

test("post images fit without cropping and image, file, and web link attachments remain usable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  test.setTimeout(90_000);
  await signIn(page);
  await page.goto("/app");

  await page.getByRole("button", { name: /What's on your mind/ }).click();
  await page
    .getByPlaceholder("Share a classroom win, challenge, or useful insight...")
    .fill("Post attachment regression check");
  await page.getByLabel("Choose an image to attach").setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByText("Image ready to share")).toBeVisible();

  await page.getByLabel("Choose a file to attach").setInputFiles({
    name: "lesson-notes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF"),
  });
  await expect(page.getByText(/lesson-notes\.pdf/)).toBeVisible();

  await page.getByRole("button", { name: "Add web link" }).click();
  await page.getByLabel("Web link", { exact: true }).fill("example.com/lesson");
  await page.getByRole("button", { name: "Attach link" }).click();
  await expect(page.getByText("https://example.com/lesson")).toBeVisible();
  await page.getByRole("button", { name: "Post", exact: true }).last().click();

  const post = page
    .getByRole("article")
    .filter({ hasText: "Post attachment regression check" })
    .first();
  await expect(post).toBeVisible({ timeout: 30_000 });
  await expect(
    post.getByRole("link", { name: "Open attached file lesson-notes.pdf" }),
  ).toBeVisible();
  await expect(
    post.getByRole("link", {
      name: "Open shared web link to example.com",
    }),
  ).toHaveAttribute("href", "https://example.com/lesson");

  const image = post.getByAltText("Shared post image");
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((element) => getComputedStyle(element).objectFit),
  ).toBe("contain");
  await post
    .getByRole("button", { name: "View shared image full screen" })
    .click();
  const viewer = page.getByRole("dialog", { name: "Shared post image" });
  await expect(viewer).toBeVisible();
  const viewport = page.viewportSize();
  const viewerBox = await viewer.boundingBox();
  expect(viewerBox?.width).toBeGreaterThanOrEqual((viewport?.width ?? 1) - 2);
  expect(viewerBox?.height).toBeGreaterThanOrEqual((viewport?.height ?? 1) - 2);
  await page.getByRole("button", { name: "Close full-screen image" }).click();
  await expect(viewer).toBeHidden();
});

test("post permalinks preserve authentication destinations and expose profile links", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.goto("/post/demo-post");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fpost%2Fdemo-post$/);
  await page.getByLabel("Email address").fill("community@vista.local");
  await page.getByLabel("Password", { exact: true }).fill("VistaTeacher1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/post\/demo-post$/);
  await expect(
    page.getByText("What routines help students make their thinking visible?"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View Alex Rivera's profile" }).first(),
  ).toHaveAttribute("href", "/profile/free-educator");
  await expect(
    page.getByRole("link", { name: "View Maya Chen's profile" }).first(),
  ).toHaveAttribute("href", "/profile/plus-educator");
  await expect(
    page.getByRole("button", { name: "Comment on post" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Share post" })).toBeVisible();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3100",
  });
  await page.getByRole("button", { name: "Share post" }).click();
  await expect(page.getByText("Post link copied.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "http://127.0.0.1:3100/post/demo-post",
  );

  await page.goto("/post/missing-post");
  await expect(
    page.getByRole("heading", { name: "Post unavailable" }),
  ).toBeVisible();
});

test("profile stats reveal real content and connection-aware actions", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await signIn(page);

  await page.goto("/profile/free-educator");
  const profileSections = page.getByRole("navigation", {
    name: "Profile sections",
  });
  await expect(
    profileSections.getByRole("button", { name: "About" }),
  ).toHaveAttribute("aria-current", "page");
  expect(await profileSections.getByRole("button").allTextContents()).toEqual([
    "About",
    "Resources",
    "Posts",
  ]);

  await page.getByRole("button", { name: "View Alex Rivera's posts" }).click();
  await expect(page).toHaveURL(/\/profile\/free-educator\?tab=posts/);
  await expect(
    page.getByText("What routines help students make their thinking visible?"),
  ).toBeVisible();

  await page.goto("/profile/plus-educator");
  await page
    .getByRole("button", { name: "View Maya Chen's resources" })
    .click();
  await expect(page).toHaveURL(/\/profile\/plus-educator\?tab=resources/);
  await expect(page.getByText("Ecosystem Notice and Wonder")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Message", exact: true }),
  ).toBeEnabled();

  await page.goto("/profile/platform-admin");
  const disabledMessage = page.getByRole("button", { name: "Message" });
  await expect(disabledMessage).toBeDisabled();
  await expect(disabledMessage).toHaveAttribute(
    "title",
    "Connect with Sam Admin to send a message.",
  );

  await page.goto("/profile/plus-educator");
  await page
    .getByRole("link", { name: "View Maya Chen's connections" })
    .click();
  await expect(page).toHaveURL(
    /\/network\?view=connections&uid=plus-educator&scope=shared/,
  );
  await expect(
    page.getByRole("heading", { name: "Maya Chen's connections" }),
  ).toBeVisible();
  await expect(
    page.getByRole("article").filter({ hasText: "Jordan Okafor" }),
  ).toBeVisible();

  await page.getByRole("link", { name: /Other connections/ }).click();
  await expect(
    page.getByRole("article").filter({ hasText: "Sam Admin" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "Sam Admin" })
      .getByRole("button", { name: "Connect" }),
  ).toBeVisible();
});

test("unsafe return destinations are ignored", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium");
  await page.goto("/sign-in?returnTo=https%3A%2F%2Fevil.example");
  await page.getByLabel("Email address").fill("community@vista.local");
  await page.getByLabel("Password", { exact: true }).fill("VistaTeacher1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("mobile form controls remain at least 16px and dialogs fit the visual viewport", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  test.skip(!testInfo.project.name.startsWith("mobile"));
  await signIn(page);
  await page.goto("/resources");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => element.getBoundingClientRect().height <= window.innerHeight,
    ),
  ).toBe(true);
  for (const control of await dialog
    .locator("input:not([type=file]), textarea, select")
    .all()) {
    expect(
      Number.parseFloat(
        await control.evaluate((element) => getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(16);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
