import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { LessonDetail } from "../../src/lib/lessons/server";

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.setTimeout(120_000);
function emulator() {
  if (
    process.env.GCLOUD_PROJECT !== "demo-vista-teacher" ||
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    throw new Error(
      "Lesson reliability checks require demo Firebase emulators.",
    );
  const app =
    getApps().find((app) => app.name === "lesson-reliability-e2e") ??
    initializeApp(
      { projectId: "demo-vista-teacher" },
      "lesson-reliability-e2e",
    );
  return { db: getFirestore(app), auth: getAuth(app) };
}
async function teacher() {
  const { db, auth } = emulator();
  const uid = `lesson-browser-${randomUUID()}`;
  const email = `${uid}@vista.local`;
  const [profile, privateUser, subscription] = await Promise.all([
    db.doc("users/free-educator").get(),
    db.doc("userPrivate/free-educator").get(),
    db.doc("subscriptions/plus-educator").get(),
  ]);
  if (!profile.exists || !privateUser.exists || !subscription.exists)
    throw new Error("Seed demo teachers before running lesson browser checks.");
  await auth.createUser({
    uid,
    email,
    emailVerified: true,
    password: "VistaTeacher1!",
  });
  await Promise.all([
    db.doc(`users/${uid}`).set({
      ...profile.data(),
      uid,
      displayName: "Lesson Test Teacher",
      connectionCount: 0,
    }),
    db.doc(`userPrivate/${uid}`).set({ ...privateUser.data(), email }),
    db.doc(`subscriptions/${uid}`).set(subscription.data()!),
  ]);
  return { uid, email };
}
async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("VistaTeacher1!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}
async function api<T>(
  page: Page,
  path: string,
  method = "GET",
  body?: unknown,
) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
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
const source = {
  subject: "Science",
  gradeLevel: "Grade 5",
  topic: "Local habitats and evidence",
  durationMinutes: 50,
  teachingStyle: "balanced",
  language: "English",
  studentNeeds: "PRIVATE_BROWSER_LEARNER_CONTEXT",
};
async function evidence(
  page: Page,
  project: string,
  name: string,
  scope = "main",
) {
  const directory = `docs/audit/evidence/lesson-reliability/${project}`;
  await mkdir(directory, { recursive: true });
  // Capture the settled workspace rather than a temporary success/error toast.
  // Moving the pointer away lets Sonner's normal dismissal timer run.
  await page.mouse.move(0, (page.viewportSize()?.height ?? 900) - 1);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
    timeout: 10_000,
  });
  await page.screenshot({ path: `${directory}/${name}.png` });
  const result = await new AxeBuilder({ page })
    .include(scope)
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
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
          const bounds = button.getBoundingClientRect();
          return (
            bounds.width > 0 &&
            bounds.height > 0 &&
            (bounds.width < 43 || bounds.height < 43)
          );
        })
        .map(
          (button) => button.getAttribute("aria-label") ?? button.textContent,
        ),
    };
  }, scope);
  expect(geometry).toEqual({ overflow: false, smallButtons: [] });
  await writeFile(
    `${directory}/${name}.json`,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        accessibilityViolations: result.violations,
        geometry,
      },
      null,
      2,
    ),
  );
}

test("recovers one charged lesson after a lost response and a reload", async ({
  page,
}, info) => {
  const owner = await teacher();
  await signIn(page, owner.email);
  await page.goto("/ai-lessons");
  await page.getByLabel("Topic / unit").fill(source.topic);
  let requestId = "";
  await page.route(
    "**/api/ai-lessons",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requestId = route.request().postDataJSON().requestId;
      const completed = await route.fetch();
      expect(completed.status()).toBe(201);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Generate lesson", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `${source.topic}: A balanced lesson`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("49 of 50 remaining")).toBeVisible();
  const { db } = emulator();
  const docs = await db
    .collection("lessons")
    .where("ownerId", "==", owner.uid)
    .get();
  expect(docs.size).toBe(1);
  const replay = await api<LessonDetail>(page, "/api/ai-lessons", "POST", {
    source: docs.docs[0].data().source,
    requestId,
  });
  expect(replay.status).toBe(201);
  expect(replay.body.id).toBe(docs.docs[0].id);
  expect(replay.cache).toBe("private, no-store");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: `${source.topic}: A balanced lesson`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("49 of 50 remaining")).toBeVisible();
  await evidence(page, info.project.name, "recovered-single-lesson");
});

test("preserves stale edits, corrects teaching settings and restores history without AI usage", async ({
  page,
}, info) => {
  const owner = await teacher();
  await signIn(page, owner.email);
  const created = await api<LessonDetail>(page, "/api/ai-lessons", "POST", {
    source,
    requestId: randomUUID(),
  });
  expect(created.status).toBe(201);
  const lesson = created.body;
  await page.goto(`/ai-lessons?lesson=${lesson.id}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("form", { name: "Lesson editor" });
  await editor
    .getByLabel("Title", { exact: true })
    .fill("My retained teacher revision");
  const external = await api<LessonDetail>(
    page,
    `/api/ai-lessons/${lesson.id}`,
    "PATCH",
    {
      content: { ...lesson.content, title: "Saved in another tab" },
      expectedVersion: 1,
    },
  );
  expect(external.status).toBe(200);
  await editor.getByRole("button", { name: "Save version" }).click();
  await expect(editor.getByText(/Version 2 is now saved/)).toBeVisible();
  await expect(editor.getByLabel("Title", { exact: true })).toHaveValue(
    "My retained teacher revision",
  );
  await editor.getByText(/Version 2 is now saved/).scrollIntoViewIfNeeded();
  await evidence(
    page,
    info.project.name,
    "stale-edit-retained",
    'form[aria-label="Lesson editor"]',
  );
  await editor
    .getByText("Review the latest saved version", { exact: true })
    .click();
  await expect(
    editor.getByRole("heading", { name: "Saved in another tab", exact: true }),
  ).toBeVisible();
  await editor
    .getByRole("button", { name: "Apply my changes to version 2" })
    .click();
  await editor.getByLabel("Subject", { exact: true }).fill("Music");
  await editor.getByLabel("Grade level", { exact: true }).fill("Ages 8–10");
  await editor.getByLabel("Duration (minutes)", { exact: true }).fill("45");
  await editor
    .getByLabel("Main activity duration (minutes)")
    .fill(String(lesson.content.mainActivity.durationMinutes - 5));
  await editor.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText("Lesson version saved.")).toBeVisible();
  const saved = await api<LessonDetail>(page, `/api/ai-lessons/${lesson.id}`);
  expect(saved.body.source).toMatchObject({
    subject: "Music",
    gradeLevel: "Ages 8–10",
    durationMinutes: 45,
  });
  await emulator()
    .db.doc(`usage/${owner.uid}_${new Date().toISOString().slice(0, 7)}`)
    .update({ lastAiLessonAt: Timestamp.fromMillis(0) });
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(page.getByText("New lesson version generated.")).toBeVisible();
  await expect(page.getByText("48 of 50 remaining")).toBeVisible();
  const generated = await api<LessonDetail>(
    page,
    `/api/ai-lessons/${lesson.id}`,
  );
  expect(generated.body.content).toMatchObject({
    subject: "Music",
    gradeLevel: "Ages 8–10",
    durationMinutes: 45,
  });
  await page.getByText("Version history (4)", { exact: true }).click();
  await page
    .getByRole("button", { name: "Preview version 1", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Lesson version 1", exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText("Sample content");
  // Prior generation feedback must not obscure the dialog's fixed controls.
  await dialog
    .getByRole("button", { name: "Close lesson version 1", exact: true })
    .click({ trial: true, timeout: 1_000 });
  const scrollRegion = dialog.getByRole("region", {
    name: "Lesson version 1 content",
    exact: true,
  });
  await scrollRegion.focus();
  // Complete the native PageDown scroll before testing the separate Home action.
  await scrollRegion.evaluate((element) => {
    const region = element as HTMLElement;
    region.dataset.pageDownFinished = "false";
    region.addEventListener(
      "scrollend",
      () => {
        region.dataset.pageDownFinished = "true";
      },
      { once: true },
    );
  });
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => scrollRegion.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(scrollRegion).toHaveAttribute("data-page-down-finished", "true");
  await expect(scrollRegion).toBeFocused();
  await page.keyboard.press("Home");
  await expect
    .poll(() => scrollRegion.evaluate((element) => element.scrollTop))
    .toBe(0);
  await expect(scrollRegion).toBeFocused();
  await evidence(
    page,
    info.project.name,
    "preview-saved-version",
    '[role="dialog"]',
  );
  await dialog
    .getByRole("button", { name: "Restore version 1", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const restored = await api<LessonDetail>(
    page,
    `/api/ai-lessons/${lesson.id}`,
  );
  expect(restored.body).toMatchObject({
    currentVersion: 5,
    sampleMode: true,
    content: lesson.content,
  });
  await expect(page.getByText("48 of 50 remaining")).toBeVisible();
  await evidence(page, info.project.name, "restored-version-no-ai-charge");
});

test("recovers a partial batch and continues only the remaining lessons", async ({
  page,
}, info) => {
  const owner = await teacher();
  await signIn(page, owner.email);
  await page.goto("/ai-lessons");
  await page.getByLabel("Topic / unit").fill("Evidence from local ecosystems");
  await page.getByLabel("Lessons to generate").selectOption("3");
  let requestId = "";
  let interruptNextGeneration = true;
  await page.route("**/api/ai-lessons", async (route) => {
    if (route.request().method() !== "POST" || !interruptNextGeneration)
      return route.continue();
    interruptNextGeneration = false;
    requestId = route.request().postDataJSON().requestId;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort("failed");
  });
  const recoveryResponse = () =>
    page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().endsWith(`/api/ai-lessons/batches/${requestId}`),
    );
  const recoveryChecked = recoveryResponse();
  await page
    .getByRole("button", { name: "Generate 3 lessons", exact: true })
    .click();
  const recovery = await recoveryChecked;
  expect(recovery.status()).toBe(200);
  expect(await recovery.finished()).toBeNull();
  const progress = page.getByRole("region", {
    name: "Lesson request progress",
  });
  await expect(
    progress.getByRole("button", { name: "Resume saved request" }),
  ).toBeEnabled();
  expect(
    (
      await emulator()
        .db.collection("lessons")
        .where("ownerId", "==", owner.uid)
        .get()
    ).size,
  ).toBe(1);
  await progress.scrollIntoViewIfNeeded();
  await evidence(page, info.project.name, "partial-batch-saved");
  const reloadChecked = recoveryResponse();
  await page.reload();
  const recoveredAfterReload = await reloadChecked;
  expect(recoveredAfterReload.status()).toBe(200);
  expect(await recoveredAfterReload.finished()).toBeNull();
  await expect(
    progress.getByRole("button", { name: "Resume saved request" }),
  ).toBeEnabled();
  await progress.getByRole("button", { name: "Resume saved request" }).click();
  await expect(
    progress.getByText("All requested lessons are saved."),
  ).toBeVisible();
  await expect(
    progress.getByRole("button", { name: "Saved — open lesson" }),
  ).toHaveCount(3);
  await expect(page.getByText("47 of 50 remaining")).toBeVisible();
  expect(
    (
      await emulator()
        .db.collection("lessons")
        .where("ownerId", "==", owner.uid)
        .get()
    ).size,
  ).toBe(3);
  const manifest = await api<{ lessons: LessonDetail[] }>(
    page,
    `/api/ai-lessons/batches/${requestId}`,
  );
  expect(manifest.body.lessons).toHaveLength(3);
  await progress.scrollIntoViewIfNeeded();
  await evidence(page, info.project.name, "batch-complete-once");
  await progress
    .getByRole("button", { name: "Saved — open lesson" })
    .first()
    .click();
  await expect(page).toHaveURL(
    new RegExp(`lesson=${manifest.body.lessons[0].id}$`),
  );
  await page.reload();
  await expect(page).toHaveURL(
    new RegExp(`lesson=${manifest.body.lessons[0].id}$`),
  );
  await page.getByRole("button", { name: "New lesson", exact: true }).click();
  await expect(page).toHaveURL(/lesson=new$/);
  await page.getByLabel("Topic / unit").fill("My new lesson after a batch");
  await page.reload();
  await expect(page.getByLabel("Topic / unit")).toHaveValue(
    "My new lesson after a batch",
  );
});

test("keeps each tab's recovery when another tab finishes a request", async ({
  page,
  context,
}) => {
  const owner = await teacher();
  await signIn(page, owner.email);
  await page.goto("/ai-lessons?lesson=new");
  await page.getByLabel("Topic / unit").fill("Habitats in the first tab");
  let releaseFirst!: () => void;
  const released = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstCommitted = false;
  await page.route(
    "**/api/ai-lessons",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      firstCommitted = true;
      await released;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Generate lesson", exact: true })
    .click();
  await expect.poll(() => firstCommitted).toBe(true);
  const second = await context.newPage();
  try {
    await emulator()
      .db.doc(`usage/${owner.uid}_${new Date().toISOString().slice(0, 7)}`)
      .update({ lastAiLessonAt: Timestamp.fromMillis(0) });
    await second.goto("/ai-lessons?lesson=new");
    await second
      .getByLabel("Topic / unit")
      .fill("Ecosystems in the second tab");
    await second.getByLabel("Lessons to generate").selectOption("2");
    await second.route(
      "**/api/ai-lessons",
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        await route.abort("failed");
      },
      { times: 1 },
    );
    await second
      .getByRole("button", { name: "Generate 2 lessons", exact: true })
      .click();
    const progress = second.getByRole("region", {
      name: "Lesson request progress",
    });
    await expect(
      progress.getByRole("button", { name: "Resume saved request" }),
    ).toBeEnabled();
    releaseFirst();
    await expect(
      page.getByRole("heading", {
        name: "Habitats in the first tab: A balanced lesson",
        exact: true,
      }),
    ).toBeVisible();
    await second.reload();
    await expect(
      progress.getByRole("button", { name: "Resume saved request" }),
    ).toBeEnabled();
    await progress
      .getByRole("button", { name: "Resume saved request" })
      .click();
    await expect(
      progress.getByText("All requested lessons are saved."),
    ).toBeVisible();
    await expect(second.getByText("47 of 50 remaining")).toBeVisible();
    expect(
      (
        await emulator()
          .db.collection("lessons")
          .where("ownerId", "==", owner.uid)
          .get()
      ).size,
    ).toBe(3);
  } finally {
    releaseFirst();
    await second.close();
  }
});

test("an old tab cannot generate or spend allowance for a newly signed-in account", async ({
  page,
  baseURL,
}) => {
  const original = await teacher();
  const replacement = await teacher();
  await signIn(page, original.email);
  await page.goto("/ai-lessons?lesson=new");
  await page
    .getByLabel("Topic / unit")
    .fill("Private plans from the original account");
  // Replace the shared server cookie, as a sign-in in another tab does, while
  // leaving this tab's mounted workspace and its original account untouched.
  const credentials = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: replacement.email,
        password: "VistaTeacher1!",
        returnSecureToken: true,
      }),
    },
  );
  expect(credentials.ok).toBe(true);
  const { idToken } = await credentials.json();
  const session = await page.request.post("/api/auth/session", {
    headers: { Origin: baseURL! },
    data: { idToken },
  });
  expect(session.status()).toBe(200);
  const rejected = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/ai-lessons") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Generate lesson", exact: true })
    .click();
  const response = await rejected;
  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({ code: "account-changed" });
  await expect(page.getByText(/Your signed-in account changed/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resume saved request" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reload account" }),
  ).toBeEnabled();
  const { db } = emulator();
  for (const uid of [original.uid, replacement.uid]) {
    expect(
      (await db.collection("lessons").where("ownerId", "==", uid).get()).empty,
    ).toBe(true);
    expect(
      (
        await db
          .collection("lessonGenerationRequests")
          .where("ownerId", "==", uid)
          .get()
      ).empty,
    ).toBe(true);
    expect(
      (
        await db
          .doc(`usage/${uid}_${new Date().toISOString().slice(0, 7)}`)
          .get()
      ).exists,
    ).toBe(false);
  }
  await page.getByRole("button", { name: "Reload account" }).click();
  await expect(
    page.getByRole("region", { name: "Lesson request progress" }),
  ).toHaveCount(0);
  await expect(page.getByText("50 of 50 remaining")).toBeVisible();
});

test("keeps older saved lessons reachable after deleting the pagination boundary", async ({
  page,
}) => {
  const owner = await teacher();
  await signIn(page, owner.email);
  const created = await api<LessonDetail>(page, "/api/ai-lessons", "POST", {
    source,
    requestId: randomUUID(),
  });
  expect(created.status).toBe(201);
  const db = emulator().db;
  const template = (await db.doc(`lessons/${created.body.id}`).get()).data()!;
  const batch = db.batch();
  for (let index = 0; index < 25; index++) {
    const title = `Library lesson ${String(index).padStart(2, "0")}`;
    batch.set(
      db.doc(
        `lessons/${index === 0 ? created.body.id : `${owner.uid}-${index}`}`,
      ),
      {
        ...template,
        title,
        content: { ...template.content, title },
        updatedAt: Timestamp.fromMillis(index * 1000),
      },
    );
  }
  await batch.commit();
  await page.goto("/ai-lessons?lesson=new");
  await expect(
    page.getByRole("button", { name: /^Continue refining Library lesson/ }),
  ).toHaveCount(20);
  await page
    .getByRole("button", { name: "Delete Library lesson 05", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete lesson?" });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Continue refining Library lesson 05",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Load more lessons", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Continue refining Library lesson/ }),
  ).toHaveCount(24);
  await expect(
    page.getByRole("button", { name: "Load more lessons", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Continue refining Library lesson 00",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Library lesson 00", exact: true }),
  ).toBeVisible();
});
