import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import AxeBuilder from "@axe-core/playwright";

function emulator() {
  if (
    process.env.GCLOUD_PROJECT !== "demo-vista-teacher" ||
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    throw new Error("Worksheet browser tests require demo Firebase emulators.");
  const app =
    getApps().find((app) => app.name === "worksheet-e2e") ??
    initializeApp({ projectId: "demo-vista-teacher" }, "worksheet-e2e");
  return { db: getFirestore(app), auth: getAuth(app) };
}
async function account() {
  const { db, auth } = emulator();
  const uid = `worksheet-${randomUUID()}`;
  const email = `${uid}@vista.local`;
  const [profile, privateUser, subscription] = await Promise.all([
    db.doc("users/free-educator").get(),
    db.doc("userPrivate/free-educator").get(),
    db.doc("subscriptions/plus-educator").get(),
  ]);
  await auth.createUser({
    uid,
    email,
    emailVerified: true,
    password: "VistaTeacher1!",
  });
  await Promise.all([
    db
      .doc(`users/${uid}`)
      .set({ ...profile.data(), uid, displayName: "Worksheet Teacher" }),
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
  await expect(page).toHaveURL(/\/app$/, { timeout: 30000 });
}
async function api(page: Page, path: string, method = "GET", body?: unknown) {
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
        body: await response.json().catch(() => null),
        disposition: response.headers.get("Content-Disposition"),
      };
    },
    { path, method, body },
  );
}
const source = {
  subject: "Science",
  gradeLevel: "Grade 6",
  topic: "Local food webs",
  difficulty: "mixed",
  language: "English",
  questionCounts: {
    multipleChoice: 1,
    shortAnswer: 1,
    extendedResponse: 1,
    matching: 1,
    fillInBlank: 1,
    trueFalse: 1,
  },
};
async function inspect(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const geometry = await page.evaluate(() => ({
    overflow:
      document.documentElement.scrollWidth > innerWidth + 1 ||
      Array.from(document.querySelectorAll("#platform-scroll-container")).some(
        (element) => element.scrollWidth > element.clientWidth + 1,
      ),
    smallButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    )
      .filter((button) => {
        const box = button.getBoundingClientRect();
        return (
          box.width > 0 && box.height > 0 && (box.width < 43 || box.height < 43)
        );
      })
      .map((button) => button.getAttribute("aria-label") ?? button.textContent),
  }));
  expect(geometry).toEqual({ overflow: false, smallButtons: [] });
}

test("teachers create, edit, recover, download, restore and delete a worksheet", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const teacher = await account();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, teacher.email);
  await page
    .getByRole("link", { name: "Create a worksheet", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create worksheet", exact: true }),
  ).toBeVisible();
  await page.getByLabel(/^Subject/).fill("Science");
  await page.getByLabel("Grade level / age group").fill("Grade 6");
  await page.getByLabel(/^Topic/).fill("Local food webs");
  await page.getByLabel("Total questions", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Generate worksheet", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "whole number" }),
  ).toBeVisible();
  await page.getByLabel("Total questions", { exact: true }).fill("8");
  await page.getByLabel("Difficulty", { exact: true }).selectOption("mixed");
  await inspect(page);
  const directory = "docs/audit/evidence/worksheets";
  await mkdir(directory, { recursive: true });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    const container = document.getElementById("platform-scroll-container");
    if (container) container.scrollTop = 0;
  });
  await page.screenshot({
    path: `${directory}/${testInfo.project.name}-create.png`,
  });
  await page
    .getByText("Question types", { exact: true })
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: `${directory}/${testInfo.project.name}-question-mix.png`,
  });
  await page
    .getByRole("button", { name: "Generate worksheet", exact: true })
    .click();
  await expect(page).toHaveURL(/\/worksheets\/(?!new$)[^/]+$/, {
    timeout: 30000,
  });
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const generated = await api(page, `/api/worksheets/${id}`);
  expect(generated.status).toBe(200);
  expect(generated.body.questionCount).toBe(8);
  expect(
    generated.body.content.questions.filter(
      (question: { type: string }) => question.type === "multipleChoice",
    ),
  ).toHaveLength(2);
  expect(
    generated.body.content.questions.filter(
      (question: { type: string }) => question.type === "shortAnswer",
    ),
  ).toHaveLength(2);
  const originalTitle = generated.body.title;
  await expect(
    page.getByRole("heading", { name: originalTitle, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Worksheets", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Worksheets", exact: true }),
  ).toBeVisible();
  await inspect(page);
  await page.screenshot({
    path: `${directory}/${testInfo.project.name}-list.png`,
  });
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: originalTitle, exact: true }),
    })
    .click();
  await expect(
    page.getByRole("tab", { name: "Student worksheet" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).not.toContainText(
    "A real generation will provide a subject-specific model answer",
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Question", { exact: true })
    .first()
    .fill("Which of these is a producer in a food web?");
  await page
    .getByLabel("Worksheet title", { exact: true })
    .fill("Teacher-edited food webs");
  await page
    .getByLabel("Model answer", { exact: true })
    .first()
    .fill("CONFIDENTIAL_WORKSHEET_KEY_826");
  await page
    .getByRole("button", { name: "Move question 3 up", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Worksheet title", { exact: true })).toHaveValue(
    "Teacher-edited food webs",
  );
  await expect(
    page.getByLabel("Model answer", { exact: true }).first(),
  ).toHaveValue("CONFIDENTIAL_WORKSHEET_KEY_826");
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "I reviewed the answer for question 1",
      exact: true,
    })
    .click();
  await inspect(page);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    const container = document.getElementById("platform-scroll-container");
    if (container) container.scrollTop = 0;
  });
  await page.screenshot({
    path: `${directory}/${testInfo.project.name}-editor.png`,
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Teacher-edited food webs",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("tabpanel")).not.toContainText("CONFIDENTIAL");
  expect((await api(page, `/api/worksheets/${id}`)).body.currentVersion).toBe(
    2,
  );
  await inspect(page);
  await page.screenshot({
    path: `${directory}/${testInfo.project.name}-student.png`,
  });
  await page.getByRole("tab", { name: "Student worksheet" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Answer key", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(
    "CONFIDENTIAL_WORKSHEET_KEY_826",
  );
  await inspect(page);
  await page.screenshot({
    path: `${directory}/${testInfo.project.name}-answer-key.png`,
  });
  for (const [label, suffix, signature] of [
    ["Download student PDF", "student-v2.pdf", "%PDF"],
    ["Download student Word", "student-v2.docx", "PK"],
    ["Download answer key PDF", "answer-key-v2.pdf", "%PDF"],
    ["Download answer key Word", "answer-key-v2.docx", "PK"],
  ]) {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: label, exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toContain(suffix);
    const file = testInfo.outputPath(suffix);
    await download.saveAs(file);
    if (testInfo.project.name === "chromium")
      await copyFile(file, `${directory}/sample-${suffix}`);
    expect(
      (await readFile(file)).subarray(0, signature.length).toString(),
    ).toBe(signature);
  }
  await page.getByText("Version history", { exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Restore version 1", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: originalTitle, exact: true }),
  ).toBeVisible();
  expect((await api(page, `/api/worksheets/${id}`)).body.currentVersion).toBe(
    3,
  );
  expect((await api(page, "/api/worksheets")).body.usage.used).toBe(1);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete worksheet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete worksheet", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/worksheets$/);
  expect((await api(page, `/api/worksheets/${id}`)).status).toBe(404);
  expect(errors).toEqual([]);
});

test("worksheet endpoints reject private access, stale saves and invalid export modes", async ({
  page,
  browser,
}) => {
  const owner = await account();
  const outsider = await account();
  await signIn(page, owner.email);
  const requestId = randomUUID();
  const created = await api(page, "/api/worksheets", "POST", {
    source,
    requestId,
  });
  expect(created.status).toBe(201);
  const id = created.body.id;
  expect(
    (await api(page, "/api/worksheets", "POST", { source, requestId })).body.id,
  ).toBe(id);
  expect((await api(page, "/api/worksheets")).body.usage.used).toBe(1);
  expect(
    (await api(page, `/api/worksheets/${id}/export/pdf?mode=invalid`)).status,
  ).toBe(400);
  const edits = await Promise.all([
    api(page, `/api/worksheets/${id}`, "PATCH", {
      content: { ...created.body.content, title: "Concurrent edit A" },
      expectedVersion: 1,
    }),
    api(page, `/api/worksheets/${id}`, "PATCH", {
      content: { ...created.body.content, title: "Concurrent edit B" },
      expectedVersion: 1,
    }),
  ]);
  expect(edits.map((edit) => edit.status).sort()).toEqual([200, 409]);
  const otherContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, outsider.email);
  for (const [path, method, body] of [
    [`/api/worksheets/${id}`, "GET", undefined],
    [
      `/api/worksheets/${id}`,
      "PATCH",
      { content: created.body.content, expectedVersion: 2 },
    ],
    [`/api/worksheets/${id}`, "DELETE", undefined],
    [`/api/worksheets/${id}/export/docx?mode=key`, "GET", undefined],
    [
      `/api/worksheets/${id}/regenerate`,
      "POST",
      { expectedVersion: 2, requestId: randomUUID() },
    ],
    [
      `/api/worksheets/${id}/versions/1/restore`,
      "POST",
      { expectedVersion: 2 },
    ],
  ] as const)
    expect((await api(otherPage, path, method, body)).status).toBe(404);
  expect((await otherPage.goto(`/worksheets/${id}`))?.status()).toBe(404);
  await otherContext.close();
  const invalidOrigin = await page.request.delete(`/api/worksheets/${id}`, {
    headers: { Origin: "https://untrusted.example" },
  });
  expect(invalidOrigin.status()).toBe(403);
});
