import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import {
  devices,
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { LessonDetail } from "../../src/lib/lessons/server";
import type { FeedPage } from "../../src/lib/feed/server";
import type { GroupedSearchResults } from "../../src/lib/search/server";

// These complete journeys use multiple real authenticated accounts and selected
// accessibility scans. Each browser interaction keeps the existing short bounds.
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.setTimeout(180_000);

function emulator() {
  const localHost = /^(127\.0\.0\.1|localhost):\d+$/;
  if (
    process.env.GCLOUD_PROJECT !== "demo-vista-teacher" ||
    !localHost.test(process.env.FIRESTORE_EMULATOR_HOST ?? "") ||
    !localHost.test(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "")
  )
    throw new Error(
      "Launch-safety fixtures require the local demo Firebase emulators.",
    );
  const app =
    getApps().find((item) => item.name === "launch-safety-e2e") ??
    initializeApp({ projectId: "demo-vista-teacher" }, "launch-safety-e2e");
  return { db: getFirestore(app), auth: getAuth(app) };
}

async function account(
  options: {
    admin?: boolean;
    legacyPrivate?: boolean;
    plus?: boolean;
  } = {},
) {
  const { db, auth } = emulator();
  const uid = `launch-safety-${randomUUID()}`;
  const email = `${uid}@vista.local`;
  const [profile, subscription] = await Promise.all([
    db.doc("users/free-educator").get(),
    db
      .doc(`subscriptions/${options.plus ? "plus-educator" : "free-educator"}`)
      .get(),
  ]);
  if (!profile.exists || !subscription.exists)
    throw new Error(
      "Seed the demo teacher profiles and subscriptions before these journeys.",
    );
  const now = Timestamp.now();
  const createdAt = Timestamp.fromMillis(1_234_000);
  const displayName = `Launch Safety Teacher ${uid.slice(-8)}`;
  await auth.createUser({
    uid,
    email,
    emailVerified: true,
    password: "VistaTeacher1!",
    displayName,
  });
  const privateData = options.legacyPrivate
    ? {
        email,
        notificationSettings: {
          email: false,
          inApp: false,
          digest: "retain-legacy-digest",
        },
        createdAt,
        unknownTop: { migrationNote: "retain-private-metadata" },
      }
    : {
        email,
        contactDetails: { professionalEmail: "", phone: "" },
        privacySettings: {
          shareContactInfo: false,
          allowMessagesFromNonConnections: false,
        },
        notificationSettings: { email: true, inApp: true },
        accountDeletion: { requestedAt: null },
        createdAt: now,
        updatedAt: now,
      };
  await Promise.all([
    db.doc(`users/${uid}`).set({
      ...profile.data(),
      uid,
      displayName,
      bio: "Classroom ideas and a public educator biography.",
      role: options.admin ? "platform_admin" : "educator",
      status: "active",
      connectionCount: 0,
      postCount: 0,
      resourceCount: 0,
      createdAt: now,
      updatedAt: now,
    }),
    db.doc(`userPrivate/${uid}`).set(privateData),
    db.doc(`subscriptions/${uid}`).set(subscription.data()!),
  ]);
  return { uid, email, displayName, createdAt, privateData };
}

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("VistaTeacher1!");
  const session = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/auth/session" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await session).status()).toBe(200);
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

async function otherActor(browser: Browser, info: TestInfo) {
  const context = await browser.newContext({
    ...devices[
      info.project.name === "mobile-chrome" ? "Pixel 7" : "Desktop Chrome"
    ],
    baseURL: info.project.use.baseURL,
  });
  return { context, page: await context.newPage() };
}

async function api<T = Record<string, unknown>>(
  page: Page,
  path: string,
  method = "GET",
  body?: unknown,
) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
      return {
        status: response.status,
        body: await response.json(),
        cache: response.headers.get("Cache-Control"),
      };
    },
    { path, method, body },
  ) as Promise<{ status: number; body: T; cache: string | null }>;
}

async function evidence(
  page: Page,
  info: TestInfo,
  name: string,
  scope = "main",
  extra: Record<string, unknown> = {},
) {
  const directory = `docs/audit/evidence/launch-safety/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  await page.mouse.move(0, (page.viewportSize()?.height ?? 900) - 1);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
    timeout: 10_000,
  });
  const scan = await new AxeBuilder({ page })
    .include(scope)
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  const geometry = await page.evaluate((selector) => {
    const region = document.querySelector(selector)!;
    return {
      overflow:
        document.documentElement.scrollWidth > innerWidth + 1 ||
        region.scrollWidth > region.clientWidth + 1,
      smallButtons: [
        ...region.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      ]
        .filter((button) => {
          const rectangle = button.getBoundingClientRect();
          return (
            rectangle.width > 0 &&
            rectangle.height > 0 &&
            getComputedStyle(button).visibility !== "hidden" &&
            (rectangle.width < 43 || rectangle.height < 43)
          );
        })
        .map(
          (button) => button.getAttribute("aria-label") ?? button.textContent,
        ),
    };
  }, scope);
  expect(geometry).toEqual({ overflow: false, smallButtons: [] });
  await page.screenshot({ path: `${directory}/${name}.png` });
  await writeFile(
    `${directory}/${name}.json`,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        accessibilityViolations: scan.violations,
        geometry,
        scope,
        ...extra,
      },
      null,
      2,
    ),
  );
}

test("a canonical lesson report survives retry and moderation stays hidden after owner edits", async ({
  page,
  browser,
}, info) => {
  const owner = await account({ plus: true });
  const reporter = await account();
  const administrator = await account({ admin: true });
  const peer = await otherActor(browser, info);
  const admin = await otherActor(browser, info);
  try {
    const { db } = emulator();
    const seed = (await db.doc("lessons/demo-lesson").get()).data();
    if (!seed?.source || !seed?.content)
      throw new Error("Seed the demo lesson before this journey.");
    const token = `safety${randomUUID().slice(0, 8)}`;
    const lessonId = `launch-${randomUUID()}`;
    const resourceId = `lesson_${lessonId}`;
    const activityId = `activity_lesson-published_${lessonId}`;
    const privateBrief = `PRIVATE_LEARNER_BRIEF_${owner.uid}`;
    const title = `Habitat evidence ${token}`;
    const content = { ...seed.content, title, subject: token };
    const source = {
      ...seed.source,
      subject: token,
      studentNeeds: privateBrief,
    };
    const now = Timestamp.now();
    await db.doc(`lessons/${lessonId}`).set({
      ...seed,
      ownerId: owner.uid,
      source,
      content,
      visibility: "draft",
      currentVersion: 1,
      generationStatus: "idle",
      sampleMode: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`lessons/${lessonId}/versions/v1`).set({
      ownerId: owner.uid,
      version: 1,
      kind: "generated",
      source,
      content,
      sampleMode: true,
      createdAt: now,
    });
    await signIn(page, owner.email);
    const published = await api<LessonDetail>(
      page,
      `/api/ai-lessons/${lessonId}`,
      "PATCH",
      {
        content,
        visibility: "published",
        expectedVersion: 1,
      },
    );
    expect(published.status).toBe(200);
    expect(published.body.publiclyAvailable).toBe(true);

    await signIn(peer.page, reporter.email);
    const resourceResponse = await peer.page.goto(`/resources/${resourceId}`);
    await expect(
      peer.page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(await resourceResponse!.text()).not.toContain(privateBrief);
    const sharedResponse = await peer.page.goto(`/lessons/${lessonId}`);
    await expect(
      peer.page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(await sharedResponse!.text()).not.toContain(privateBrief);
    expect(await peer.page.locator("body").innerText()).not.toContain(
      privateBrief,
    );
    const privateOriginal = await api(peer.page, `/api/ai-lessons/${lessonId}`);
    expect(privateOriginal.status).toBe(403);
    expect(JSON.stringify(privateOriginal.body)).not.toContain(privateBrief);
    const beforeSearch = await api<GroupedSearchResults>(
      peer.page,
      `/api/search?q=${token}`,
    );
    expect(beforeSearch.status).toBe(200);
    expect(
      beforeSearch.body.resources.map((resource) => resource.id),
    ).toContain(resourceId);
    expect(JSON.stringify(beforeSearch.body)).not.toContain(privateBrief);
    const beforeFeed = await api<FeedPage>(peer.page, "/api/feed");
    expect(beforeFeed.status).toBe(200);
    expect(beforeFeed.body.posts.map((post) => post.id)).toContain(activityId);
    expect(JSON.stringify(beforeFeed.body)).not.toContain(privateBrief);

    const reportPath = `/api/resources/${resourceId}/report`;
    await peer.page
      .getByRole("button", { name: "Report lesson", exact: true })
      .click();
    const dialog = peer.page.getByRole("dialog", {
      name: "Report lesson",
      exact: true,
    });
    const details = `Review the unsafe classroom instruction ${token}.`;
    await dialog.getByLabel("Reason", { exact: true }).selectOption("unsafe");
    await dialog
      .getByLabel("Details (optional)", { exact: true })
      .fill(details);
    // Only the first report transport is simulated; no request reaches the server.
    // Retry below uses the real route, canonical report transaction and counter.
    await peer.page.route(
      `**${reportPath}`,
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error:
              "Report service temporarily unavailable. Your details are kept.",
          }),
        }),
      { times: 1 },
    );
    await dialog
      .getByRole("button", { name: "Submit report", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Your details are kept",
    );
    await expect(
      dialog.getByLabel("Details (optional)", { exact: true }),
    ).toHaveValue(details);
    await expect(dialog.getByLabel("Reason", { exact: true })).toHaveValue(
      "unsafe",
    );
    const reportId = `resource_${resourceId}_${reporter.uid}`;
    expect((await db.doc(`reports/${reportId}`).get()).exists).toBe(false);
    await evidence(
      peer.page,
      info,
      "report-retry-retains-details",
      '[role="dialog"]',
      { transportFailureSimulated: true },
    );
    const reported = peer.page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === reportPath &&
        response.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "Submit report", exact: true })
      .click();
    expect((await reported).status()).toBe(201);
    await expect(dialog).toHaveCount(0);
    expect((await db.doc(`reports/${reportId}`).get()).data()).toMatchObject({
      targetType: "resource",
      targetId: resourceId,
      reporterId: reporter.uid,
      reason: "unsafe",
      details,
      status: "open",
    });
    const duplicate = await api(
      peer.page,
      `/api/feed/${activityId}/report`,
      "POST",
      { reason: "unsafe", details },
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("already-reported");
    expect(
      (await db.collection("reports").where("targetId", "==", resourceId).get())
        .size,
    ).toBe(1);
    expect(
      (await db.doc(`resources/${resourceId}`).get()).data()?.reportCount,
    ).toBe(1);

    await signIn(admin.page, administrator.email);
    await admin.page.goto("/admin/reports");
    const reportRow = admin.page
      .getByRole("row")
      .filter({ hasText: reporter.uid });
    await expect(reportRow).toContainText(title);
    expect(await reportRow.innerText()).not.toContain(privateBrief);
    await reportRow
      .getByRole("button", { name: "Hide content", exact: true })
      .click();
    const confirmation = admin.page.getByRole("alertdialog");
    await confirmation
      .getByLabel("Reason", { exact: true })
      .fill("Unsafe classroom directions require moderator review.");
    const moderated = admin.page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/admin/actions" &&
        response.request().method() === "POST",
    );
    await confirmation
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    expect((await moderated).status()).toBe(200);
    await expect(confirmation).toHaveCount(0);
    await expect(
      reportRow.getByText("rejected", { exact: true }),
    ).toBeVisible();
    expect(
      (await db.doc(`resources/${resourceId}`).get()).data()?.moderationStatus,
    ).toBe("rejected");

    await page.goto(`/ai-lessons?lesson=${lessonId}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.getByRole("form", { name: "Lesson editor" });
    const revisedTitle = `Revised habitat evidence ${token}`;
    await editor.getByLabel("Title", { exact: true }).fill(revisedTitle);
    await editor
      .getByLabel("Lesson status", { exact: true })
      .selectOption("published");
    await editor
      .getByRole("button", { name: "Save version", exact: true })
      .click();
    await expect(
      page.getByText("Lesson version saved.", { exact: true }),
    ).toBeVisible();
    const retained = await api<LessonDetail>(
      page,
      `/api/ai-lessons/${lessonId}`,
    );
    expect(retained.status).toBe(200);
    expect(retained.body).toMatchObject({
      publiclyAvailable: false,
      moderationStatus: "rejected",
      content: { title: revisedTitle },
      source: { studentNeeds: privateBrief },
    });
    expect(
      (await db.doc(`resources/${resourceId}`).get()).data(),
    ).toMatchObject({ title: revisedTitle, moderationStatus: "rejected" });
    await page.goto("/resources?view=mine");
    await page.getByLabel("Search resources", { exact: true }).fill(token);
    await expect(page.getByText(revisedTitle, { exact: true })).toBeVisible();
    const hidden = page.getByText("Hidden from community", { exact: true });
    await expect(hidden).toBeVisible();
    await hidden.scrollIntoViewIfNeeded();
    await evidence(page, info, "owner-edit-retains-moderation");
    await page.goto(`/lessons/${lessonId}`);
    await expect(
      page.getByRole("heading", { name: revisedTitle, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "hidden from the community" }),
    ).toBeVisible();

    for (const path of [`/lessons/${lessonId}`, `/resources/${resourceId}`]) {
      const response = await peer.page.goto(path);
      await expect(
        peer.page.getByRole("heading", { name: "404", exact: true }),
      ).toBeVisible();
      await expect(
        peer.page.getByText(revisedTitle, { exact: true }),
      ).toHaveCount(0);
      expect(await response!.text()).not.toContain(privateBrief);
    }
    const downloadStatus = await peer.page.evaluate(
      async (path) => (await fetch(path)).status,
      `/api/resources/${resourceId}/download`,
    );
    expect(downloadStatus).toBe(404);
    const afterSearch = await api<GroupedSearchResults>(
      peer.page,
      `/api/search?q=${token}`,
    );
    expect(afterSearch.status).toBe(200);
    expect(
      afterSearch.body.resources.map((resource) => resource.id),
    ).not.toContain(resourceId);
    const afterFeed = await api<FeedPage>(peer.page, "/api/feed");
    expect(afterFeed.status).toBe(200);
    expect(afterFeed.body.posts.map((post) => post.id)).not.toContain(
      activityId,
    );
    expect(JSON.stringify([afterSearch.body, afterFeed.body])).not.toContain(
      privateBrief,
    );
    await peer.page.goto("/resources");
    await peer.page.getByLabel("Search resources", { exact: true }).fill(token);
    await expect(
      peer.page.getByText(revisedTitle, { exact: true }),
    ).toHaveCount(0);
  } finally {
    await peer.context.close();
    await admin.context.close();
  }
});

test("a simulated AI budget preflight rejection retains the brief without a job, debit or upgrade prompt", async ({
  page,
}, info) => {
  const owner = await account();
  const { db } = emulator();
  await signIn(page, owner.email);
  await page.goto("/ai-lessons");
  const brief = {
    subject: "Science",
    gradeLevel: "Grade 5",
    topic: `Keep the habitat brief ${owner.uid.slice(-8)}`,
    duration: "45",
    needs: "Use visual examples and small groups.",
    instructions:
      "Keep the outdoor observation and the exit-ticket assessment.",
  };
  await page.getByLabel("Subject", { exact: true }).fill(brief.subject);
  await page.getByLabel("Grade level", { exact: true }).fill(brief.gradeLevel);
  await page.getByLabel("Topic / unit", { exact: true }).fill(brief.topic);
  await page.getByLabel("Duration", { exact: true }).fill(brief.duration);
  await page
    .getByLabel("Student needs (optional)", { exact: true })
    .fill(brief.needs);
  await page
    .getByText("More teaching context (optional)", { exact: true })
    .click();
  await page
    .getByLabel("Additional teacher instructions", { exact: true })
    .fill(brief.instructions);
  const period = new Date().toISOString().slice(0, 7);
  const usageRef = db.doc(`usage/${owner.uid}_${period}`);
  const usageBefore = (await usageRef.get()).data();
  const spendBefore = (await db.collection("aiSpendAttempts").get()).size;
  let requestId = "";
  let posts = 0;
  // Client fault simulation only: the real monetary admission transaction is
  // covered by the dedicated Firestore integration tests, not this interception.
  await page.route("**/api/ai-lessons", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    requestId = route.request().postDataJSON().requestId;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "ai-budget-exhausted",
        error:
          "AI generation is paused because the pilot budget is used. Your drafts and saved work are available to edit and export.",
      }),
    });
  });
  const checked = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname ===
        `/api/ai-lessons/requests/${requestId}` &&
      requestId !== "",
  );
  await page
    .getByRole("button", { name: "Generate lesson", exact: true })
    .click();
  // This GET is forwarded to the real app; absence is authoritative, not stubbed.
  expect((await checked).status()).toBe(404);
  const progress = page.getByRole("region", {
    name: "Lesson request progress",
  });
  await expect(progress.getByRole("alert")).toContainText(
    "pilot budget is used",
  );
  await expect(
    page.getByRole("button", { name: "Generate lesson", exact: true }),
  ).toBeEnabled();
  await expect(
    progress.getByRole("button", {
      name: /Resume saved request|Retry failed lessons/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Community limit reached", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Keep preparing with AI", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("3 of 3 remaining", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Topic / unit", { exact: true })).toHaveValue(
    brief.topic,
  );
  await expect
    .poll(() =>
      page.evaluate(
        (uid) => sessionStorage.getItem(`vista:lesson-request:v2:${uid}`),
        owner.uid,
      ),
    )
    .toBeNull();
  await progress.scrollIntoViewIfNeeded();
  await evidence(page, info, "budget-preflight-keeps-brief", "main", {
    clientFaultSimulation:
      "POST 503 ai-budget-exhausted only; real request-status GET returned 404",
    monetaryAdmissionVerifiedHere: false,
  });
  await page.reload();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    brief.subject,
  );
  await expect(page.getByLabel("Grade level", { exact: true })).toHaveValue(
    brief.gradeLevel,
  );
  await expect(page.getByLabel("Topic / unit", { exact: true })).toHaveValue(
    brief.topic,
  );
  await expect(page.getByLabel("Duration", { exact: true })).toHaveValue(
    brief.duration,
  );
  await expect(
    page.getByLabel("Student needs (optional)", { exact: true }),
  ).toHaveValue(brief.needs);
  await page
    .getByText("More teaching context (optional)", { exact: true })
    .click();
  await expect(
    page.getByLabel("Additional teacher instructions", { exact: true }),
  ).toHaveValue(brief.instructions);
  await expect(
    page.getByRole("button", { name: "Generate lesson", exact: true }),
  ).toBeEnabled();
  expect(posts).toBe(1);
  expect(
    (await db.doc(`lessonGenerationRequests/${owner.uid}_${requestId}`).get())
      .exists,
  ).toBe(false);
  expect(
    (await db.collection("lessons").where("ownerId", "==", owner.uid).get())
      .empty,
  ).toBe(true);
  expect((await usageRef.get()).data()).toEqual(usageBefore);
  expect((await db.collection("aiSpendAttempts").get()).size).toBe(spendBefore);
});

test("legacy private settings recover through real sign-in and preserve opt-outs and unknown fields after saving", async ({
  page,
  browser,
}, info) => {
  const owner = await account({ legacyPrivate: true });
  const viewer = await account();
  const peer = await otherActor(browser, info);
  const { db } = emulator();
  const privateRef = db.doc(`userPrivate/${owner.uid}`);
  try {
    await signIn(peer.page, viewer.email);
    // Profiles require a session. Another educator's view is a public projection
    // and must never initialize or migrate the owner's private storage.
    await peer.page.goto(`/profile/${owner.uid}`);
    await expect(
      peer.page.getByRole("heading", { name: owner.displayName, exact: true }),
    ).toBeVisible();
    await expect(
      peer.page.getByText("Classroom ideas and a public educator biography.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      peer.page.getByRole("button", { name: "Message", exact: true }),
    ).toBeDisabled();
    expect(await peer.page.locator("main").innerText()).not.toContain(
      owner.email,
    );
    expect((await privateRef.get()).data()).toEqual(owner.privateData);
    await evidence(peer.page, info, "legacy-private-public-profile");

    await signIn(page, owner.email);
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Contact and privacy", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Professional email", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByLabel("Professional phone", { exact: true }),
    ).toHaveValue("");
    const notificationToggle = page.getByRole("checkbox", {
      name: /^In-app notifications/,
    });
    await expect(notificationToggle).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /^Show these contact details/ }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /^Allow messages from teachers/ }),
    ).not.toBeChecked();
    const repaired = (await privateRef.get()).data()!;
    expect(repaired).toMatchObject({
      email: owner.email,
      contactDetails: { professionalEmail: "", phone: "" },
      privacySettings: {
        shareContactInfo: false,
        allowMessagesFromNonConnections: false,
      },
      notificationSettings: {
        email: false,
        inApp: false,
        digest: "retain-legacy-digest",
      },
      accountDeletion: { requestedAt: null },
      unknownTop: { migrationNote: "retain-private-metadata" },
    });
    expect(repaired.createdAt.isEqual(owner.createdAt)).toBe(true);
    await page
      .getByLabel("Professional phone", { exact: true })
      .fill("+46 70 123 45 67");
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/settings" &&
        response.request().method() === "PATCH",
    );
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    expect((await saved).status()).toBe(200);
    await expect(
      page.getByText("Settings saved.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel("Professional phone", { exact: true }),
    ).toHaveValue("+46 70 123 45 67");
    await expect(
      page.getByLabel("Professional email", { exact: true }),
    ).toHaveValue("");
    await expect(notificationToggle).not.toBeChecked();
    const stored = (await privateRef.get()).data()!;
    expect(stored).toMatchObject({
      email: owner.email,
      contactDetails: { professionalEmail: "", phone: "+46 70 123 45 67" },
      notificationSettings: {
        email: false,
        inApp: false,
        digest: "retain-legacy-digest",
      },
      unknownTop: { migrationNote: "retain-private-metadata" },
      accountDeletion: { requestedAt: null },
    });
    expect(stored.createdAt.isEqual(owner.createdAt)).toBe(true);
    await evidence(page, info, "legacy-private-settings-saved", "main form");
    await peer.page.reload();
    expect(await peer.page.locator("main").innerText()).not.toContain(
      "+46 70 123 45 67",
    );
    expect(await peer.page.locator("main").innerText()).not.toContain(
      owner.email,
    );
  } finally {
    await peer.context.close();
  }
});
