import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

function emulator() {
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    process.env.GCLOUD_PROJECT !== "demo-vista-teacher"
  ) {
    throw new Error(
      "Creation-flow fixtures require the demo Firebase emulator suite.",
    );
  }
  const app =
    getApps().find((item) => item.name === "creation-flow-tests") ??
    initializeApp({ projectId: "demo-vista-teacher" }, "creation-flow-tests");
  return { db: getFirestore(app), auth: getAuth(app) };
}

async function account(plan: "free" | "plus" = "free", onboarded = true) {
  const { db, auth } = emulator();
  const uid = `ux-${randomUUID()}`;
  const email = `${uid}@vista.local`;
  await auth.createUser({
    uid,
    email,
    emailVerified: true,
    password: "VistaTeacher1!",
    displayName: "Ada Teacher",
  });
  if (onboarded) {
    const [profile, subscription] = await Promise.all([
      db.doc("users/free-educator").get(),
      db
        .doc(
          `subscriptions/${plan === "plus" ? "plus-educator" : "free-educator"}`,
        )
        .get(),
    ]);
    await Promise.all([
      db.doc(`users/${uid}`).set({
        ...profile.data(),
        uid,
        displayName: "Ada Teacher",
        country: "",
        city: "",
        bio: "",
        connectionCount: 0,
        postCount: 0,
        resourceCount: 0,
      }),
      db.doc(`subscriptions/${uid}`).set(subscription.data()!),
    ]);
  }
  return { uid, email };
}

async function signIn(
  page: Page,
  email: string,
  returnTo?: string,
  onboarding = false,
) {
  await page.goto(
    `/sign-in${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`,
  );
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("VistaTeacher1!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(onboarding ? /\/onboarding/ : /\/dashboard$/, {
    timeout: 30_000,
  });
}

async function copyLesson(uid: string) {
  const { db } = emulator();
  const source = (await db.doc("lessons/demo-lesson").get()).data()!;
  const lessonId = `${uid}-lesson`;
  await db
    .doc(`lessons/${lessonId}`)
    .set({ ...source, ownerId: uid, visibility: "draft" });
  return lessonId;
}

async function usage(uid: string, values: Record<string, number>) {
  const period = new Date().toISOString().slice(0, 7);
  await emulator()
    .db.doc(`usage/${uid}_${period}`)
    .set({ uid, period, lastAiLessonAt: Timestamp.fromMillis(0), ...values });
}

async function postJson(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
    { path, body },
  );
}

async function accessible(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
}

test("post drafts recover after failed publication and refresh", async ({
  page,
}, testInfo) => {
  const user = await account();
  await signIn(page, user.email);
  await page.goto("/app");
  await page.getByRole("button", { name: /What's on your mind/ }).click();
  const editor = page.locator('textarea[name="post-content"]');
  await editor.fill("Keep this unfinished classroom idea");
  await page.getByRole("button", { name: "Question", exact: true }).click();
  await page.getByRole("button", { name: "Add web link" }).click();
  await page
    .getByLabel("Web link", { exact: true })
    .fill("example.com/teaching");
  await page.getByRole("button", { name: "Attach link" }).click();
  await page.route(
    "**/api/feed",
    async (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Posting temporarily unavailable." }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Post", exact: true }).last().click();
  await expect(
    page.getByText("Posting temporarily unavailable."),
  ).toBeVisible();
  await expect(editor).toHaveValue("Keep this unfinished classroom idea");
  await page.reload();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "unfinished draft was restored" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /What's on your mind/ }).click();
  await expect(editor).toHaveValue("Keep this unfinished classroom idea");
  await expect(
    page.getByRole("button", { name: "Question", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("https://example.com/teaching", { exact: true }),
  ).toBeVisible();
  await accessible(page);
  await page
    .locator("#platform-scroll-container")
    .evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: testInfo.outputPath("recovered-post.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Post", exact: true }).last().click();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "Keep this unfinished classroom idea" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(/unfinished draft was restored/)).toHaveCount(0);
});

test("lesson edits recover privately and survive a failed save", async ({
  page,
}, testInfo) => {
  const user = await account("plus");
  const lessonId = await copyLesson(user.uid);
  await signIn(page, user.email);
  await page.goto(`/ai-lessons?lesson=${lessonId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: /^Title/ })
    .fill("My unfinished lesson revision");
  await page.route(`**/api/ai-lessons/${lessonId}`, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Saving temporarily unavailable." }),
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText("Saving temporarily unavailable.")).toBeVisible();
  expect(
    (await emulator().db.doc(`lessons/${lessonId}`).get()).data()?.content
      .title,
  ).toBe("Investigating Local Ecosystems");
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /^Title/ })).toHaveValue(
    "My unfinished lesson revision",
  );
  await accessible(page);
  await page
    .locator("#platform-scroll-container")
    .evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: testInfo.outputPath("recovered-lesson.png"),
    fullPage: true,
  });
  await page.unroute(`**/api/ai-lessons/${lessonId}`);
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText("Lesson version saved.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /^Title/ })).toHaveValue(
    "My unfinished lesson revision",
  );
  await expect(page.getByText(/unfinished draft was restored/)).toHaveCount(0);
});

test("publishing retains posts loaded from the next feed page", async ({
  page,
}) => {
  const user = await account();
  const { db } = emulator();
  const batch = db.batch();
  for (let index = 0; index < 15; index++) {
    batch.set(db.doc(`posts/${user.uid}-${index}`), {
      authorId: user.uid,
      type: "post",
      content: `Continuity idea ${index}`,
      visibility: "public",
      moderationStatus: "approved",
      imageURLs: [],
      fileAttachments: [],
      linkURLs: [],
      tags: [],
      mentions: [],
      resourceId: null,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      bookmarkCount: 0,
      createdAt: Timestamp.fromMillis(Date.now() - index * 1000),
      updatedAt: Timestamp.now(),
    });
  }
  await batch.commit();
  await signIn(page, user.email);
  await page.goto("/app");
  await expect(
    page.getByText("Continuity idea 14", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Load more posts" }).click();
  await expect(
    page.getByText("Continuity idea 14", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /What's on your mind/ }).click();
  await page
    .getByPlaceholder("Share a classroom win, challenge, or useful insight...")
    .fill("A confirmed idea that keeps the loaded feed");
  await page.getByRole("button", { name: "Post", exact: true }).last().click();
  await expect(page.getByText("Post published.")).toBeVisible();
  await expect(
    page.getByText("Continuity idea 14", { exact: true }),
  ).toHaveCount(1);
});

test("discussion resource and message drafts recover without manual saves", async ({
  page,
}) => {
  const user = await account();
  await signIn(page, user.email);
  await page.goto("/forum/new");
  await page
    .getByRole("textbox", { name: /^Title/ })
    .fill("A draft discussion");
  await page
    .getByLabel("Your post")
    .fill("Keep this discussion while I find a useful example.");
  await page.reload();
  await expect(page.getByRole("textbox", { name: /^Title/ })).toHaveValue(
    "A draft discussion",
  );
  await page.goto("/resources/new");
  await page.getByLabel("Resource title").fill("A draft resource");
  await page.reload();
  await expect(page.getByLabel("Resource title")).toHaveValue(
    "A draft resource",
  );
  await expect(page.getByText(/File contents are not stored/)).toBeVisible();
  await page.goto("/messages/new?recipient=plus-educator");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Keep this message through a failed request.");
  const send = page.getByRole("button", { name: "Send message" });
  await expect(send).toBeEnabled();
  await page.route("**/api/messages", async (route) => route.abort("failed"), {
    times: 1,
  });
  await send.click();
  await expect(send).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "Keep this message through a failed request.",
  );
});

test("short onboarding preserves the original destination and optional profile editing", async ({
  page,
}, testInfo) => {
  const user = await account("free", false);
  await signIn(page, user.email, "/resources?view=mine", true);
  await expect(page.getByLabel("Country", { exact: true })).toHaveCount(0);
  await page.getByLabel("Primary role").selectOption("Classroom teacher");
  await page
    .getByLabel("Education stage")
    .selectOption("Primary / Elementary School");
  await page.getByLabel("Main subject or expertise").selectOption("Science");
  await accessible(page);
  await page
    .locator("#platform-scroll-container")
    .evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: testInfo.outputPath("short-onboarding.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/resources\?view=mine$/, { timeout: 30_000 });
  await page.goto("/settings/profile");
  await expect(page.getByLabel("Country (optional)")).toHaveValue("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Profile updated.")).toBeVisible();
});

test("personal navigation exposes owned resources and keyboard access", async ({
  page,
}, testInfo) => {
  const user = await account();
  const { db } = emulator();
  const resource = (await db.doc("resources/demo-resource").get()).data()!;
  await db
    .doc(`resources/${user.uid}-resource`)
    .set({ ...resource, authorId: user.uid, title: "Ada's own resource" });
  await signIn(page, user.email);
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#platform-main")).toBeFocused();
  await page.getByRole("button", { name: "Open profile menu" }).focus();
  await page.keyboard.press("ArrowDown");
  await page
    .getByRole("menuitem", { name: "My Resources", exact: true })
    .click();
  await expect(page).toHaveURL(/\/resources\?view=mine$/);
  await expect(
    page.getByRole("heading", { name: "My Resources", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Ada's own resource", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Ecosystem Notice and Wonder", { exact: true }),
  ).toHaveCount(0);
  await accessible(page);
  await page
    .locator("#platform-scroll-container")
    .evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: testInfo.outputPath("personal-resources.png"),
    fullPage: true,
  });
});

test("Community allowances work immediately below and at their boundaries", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const user = await account();
  const lessonId = await copyLesson(user.uid);
  await signIn(page, user.email);
  const source = (await emulator().db.doc(`lessons/${lessonId}`).get()).data()!
    .source;
  const created = await postJson(page, "/api/ai-lessons", { source });
  expect(created.status).toBe(201);
  const exhaustedCreation = await postJson(page, "/api/ai-lessons", { source });
  expect(exhaustedCreation.status).toBe(429);
  expect(exhaustedCreation.body.code).toBe("creation-limit-reached");
  await usage(user.uid, {
    aiLessons: 2,
    aiLessonCreations: 1,
    aiRefinements: 1,
    lessonExports: 1,
  });
  await page.goto(`/ai-lessons?lesson=${lessonId}`);
  await expect(page.getByText("1 of 2 remaining").first()).toBeVisible();
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(page.getByText("New lesson version generated.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Regenerate", exact: true }),
  ).toBeDisabled();
  const refined = await postJson(
    page,
    `/api/ai-lessons/${lessonId}/regenerate`,
    {},
  );
  expect(refined.status).toBe(429);
  expect(refined.body.code).toBe("refinement-limit-reached");
  const exportStatus = await page.evaluate(
    async (lessonId) =>
      (await fetch(`/api/ai-lessons/${lessonId}/export/docx`)).status,
    lessonId,
  );
  expect(exportStatus).toBe(200);
  const exhaustedExport = await page.evaluate(
    async (lessonId) =>
      (await fetch(`/api/ai-lessons/${lessonId}/export/docx`)).status,
    lessonId,
  );
  expect(exhaustedExport).toBe(429);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "DOCX", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Monthly allowances reset/)).toBeVisible();
});

test("Plus shares its final generation between creation and refinement", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const user = await account("plus");
  await usage(user.uid, {
    aiLessons: 49,
    aiLessonCreations: 25,
    aiRefinements: 24,
    lessonExports: 0,
  });
  await signIn(page, user.email);
  await page.goto("/ai-lessons");
  await expect(page.getByText("1 of 50 remaining")).toBeVisible();
  await page.getByLabel("Topic / unit").fill("Classroom ecosystems");
  await page.reload();
  await expect(page.getByLabel("Topic / unit")).toHaveValue(
    "Classroom ecosystems",
  );
  await page.route(
    "**/api/ai-lessons",
    async (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Generation temporarily unavailable." }),
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Generate lesson", exact: true })
    .click();
  await expect(
    page.getByText("Generation temporarily unavailable."),
  ).toBeVisible();
  await expect(page.getByLabel("Topic / unit")).toHaveValue(
    "Classroom ecosystems",
  );
  await page
    .getByRole("button", { name: "Generate lesson", exact: true })
    .click();
  await expect(
    page.getByText("Lesson generated and saved as a draft."),
  ).toBeVisible();
  await expect(page.getByText("0 of 50 remaining")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Regenerate", exact: true }),
  ).toBeDisabled();
  const stored = await emulator()
    .db.collection("lessons")
    .where("ownerId", "==", user.uid)
    .get();
  const exhausted = await postJson(
    page,
    `/api/ai-lessons/${stored.docs[0].id}/regenerate`,
    {},
  );
  expect(exhausted.status).toBe(429);
  expect(exhausted.body.code).toBe("limit-reached");
});

test("Community messaging allows the tenth message and blocks the eleventh", async ({
  page,
}) => {
  const user = await account();
  const { db } = emulator();
  const day = new Date().toISOString().slice(0, 10);
  await db
    .doc(`usage/${user.uid}_${day}`)
    .set({ uid: user.uid, period: day, messages: 9 });
  await signIn(page, user.email);
  const tenth = await postJson(page, "/api/messages", {
    recipientId: "plus-educator",
    content: "My tenth message today",
  });
  expect(tenth.status).toBe(201);
  const eleventh = await postJson(page, "/api/messages", {
    recipientId: "plus-educator",
    content: "This message must be blocked",
  });
  expect(eleventh.status).toBe(429);
  expect(eleventh.body.code).toBe("limit-reached");
  await page.goto(`/messages?conversation=${tenth.body.conversationId}`);
  await expect(
    page.getByText("Daily message limit reached", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveCount(0);
});

test("connection requests respect the unchanged five-connection boundary", async ({
  page,
}) => {
  const user = await account();
  const { db } = emulator();
  const template = (await db.doc("users/free-educator").get()).data()!;
  const peerA = `${user.uid}-peer-a`;
  const peerB = `${user.uid}-peer-b`;
  await Promise.all([
    db.doc(`users/${user.uid}`).update({ connectionCount: 4 }),
    db.doc(`users/${peerA}`).set({
      ...template,
      uid: peerA,
      displayName: "First Peer",
      connectionCount: 0,
    }),
    db.doc(`users/${peerB}`).set({
      ...template,
      uid: peerB,
      displayName: "Second Peer",
      connectionCount: 0,
    }),
  ]);
  await signIn(page, user.email);
  const allowed = await postJson(page, "/api/network/follow", {
    targetUid: peerA,
  });
  expect(allowed.status).toBe(200);
  await db.doc(`users/${user.uid}`).update({ connectionCount: 5 });
  await page.goto(`/profile/${peerB}`);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Grow your educator network" }),
  ).toBeVisible();
  await expect(page.getByText(/five-connection limit/)).toBeVisible();
});
