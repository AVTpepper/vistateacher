import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import AxeBuilder from "@axe-core/playwright";

function emulator() {
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    process.env.GCLOUD_PROJECT !== "demo-vista-teacher"
  )
    throw new Error("Launch audit requires demo Firebase emulators.");
  const app =
    getApps().find((app) => app.name === "launch-audit") ??
    initializeApp({ projectId: "demo-vista-teacher" }, "launch-audit");
  return { db: getFirestore(app), auth: getAuth(app) };
}

async function account() {
  const { db, auth } = emulator();
  const uid = `launch-${randomUUID()}`;
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
    db.doc(`users/${uid}`).set({
      ...profile.data(),
      uid,
      displayName: "Launch Teacher",
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
  await expect(page).toHaveURL(/\/app$/, { timeout: 30000 });
  await expect(
    page
      .getByRole("navigation", { name: "Teaching tools" })
      .getByRole("link", { name: "Create a lesson", exact: true }),
  ).toHaveAttribute("href", "/ai-lessons");
}
async function send(page: Page, recipientId: string) {
  return page.evaluate(async (recipientId) => {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientId,
        content: "A professional teaching conversation.",
      }),
    });
    return { status: response.status, body: await response.json() };
  }, recipientId);
}

test("recipient message privacy is enforced by the API and reflected on profiles", async ({
  page,
}) => {
  const sender = await account();
  const recipient = await account();
  const { db } = emulator();
  await signIn(page, sender.email);
  const denied = await send(page, recipient.uid);
  expect(denied.status).toBe(403);
  expect(denied.body.code).toBe("connections-only");
  expect(
    (
      await db
        .collection("conversations")
        .where("participantIds", "array-contains", recipient.uid)
        .get()
    ).empty,
  ).toBe(true);
  expect(
    (await db.collection(`users/${recipient.uid}/notifications`).get()).empty,
  ).toBe(true);
  await page.goto(`/profile/${recipient.uid}`);
  await expect(
    page.getByRole("button", { name: "Message", exact: true }),
  ).toBeDisabled();

  await db
    .doc(`userPrivate/${recipient.uid}`)
    .update({ "privacySettings.allowMessagesFromNonConnections": true });
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Message", exact: true }),
  ).toBeVisible();
  expect((await send(page, recipient.uid)).status).toBe(201);

  await db
    .doc(`userPrivate/${recipient.uid}`)
    .update({ "privacySettings.allowMessagesFromNonConnections": false });
  expect((await send(page, recipient.uid)).status).toBe(403);
  await db.doc(`follows/${sender.uid}_${recipient.uid}`).set({
    followerUid: sender.uid,
    followingUid: recipient.uid,
    status: "accepted",
  });
  expect((await send(page, recipient.uid)).status).toBe(201);
  await db
    .doc(`blocks/${recipient.uid}_${sender.uid}`)
    .set({ blockerUid: recipient.uid, blockedUid: sender.uid });
  expect((await send(page, recipient.uid)).body.code).toBe("blocked");
});

test("teacher context survives generation, editing and standard export", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const teacher = await account();
  await signIn(page, teacher.email);
  await page.goto("/ai-lessons");
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Music and local history");
  await page
    .getByLabel("Grade level", { exact: true })
    .fill("Ages 8–10, mixed ability");
  await page
    .getByLabel("Topic / unit", { exact: true })
    .fill("Stories through local folk songs");
  await page.getByLabel("Duration", { exact: true }).fill("40");
  await page
    .getByText("More teaching context (optional)", { exact: true })
    .click();
  await page.getByLabel("Curriculum / country").fill("Sweden, Lgr22");
  await page.getByLabel("Output language").fill("Swedish");
  await page.getByLabel("Class size", { exact: true }).fill("24");
  await page
    .getByLabel("Available materials and technology")
    .fill("Paper, pencils, no devices");
  await page
    .getByLabel("Additional teacher instructions")
    .fill("Include an outdoor listening activity");
  await expect(
    page.getByRole("button", { name: "Insights", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Generate lesson", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeInViewport();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  const lessons = await emulator()
    .db.collection("lessons")
    .where("ownerId", "==", teacher.uid)
    .get();
  expect(lessons.docs).toHaveLength(1);
  expect(lessons.docs[0].data().source).toMatchObject({
    subject: "Music and local history",
    language: "Swedish",
    classSize: 24,
    curriculum: "Sweden, Lgr22",
    availableMaterials: "Paper, pencils, no devices",
  });
  await mkdir("docs/audit/evidence/after", { recursive: true });
  await page.screenshot({
    path: `docs/audit/evidence/after/${info.project.name}-generated-lesson.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete lesson", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Delete lesson?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Delete lesson?" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "More", exact: true }),
  ).toBeFocused();
  const popupPromise = page.waitForEvent("popup");
  // Chromium's headless shell downloads PDFs; a full browser can display them.
  const previewDelivery = new Promise<string>((resolve) => {
    page.context().once("page", (preview) => {
      preview.on("framenavigated", (frame) => {
        if (frame === preview.mainFrame() && frame.url().startsWith("blob:"))
          resolve(frame.url());
      });
      preview.once("download", (download) => resolve(download.url()));
    });
  });
  const previewResponse = page.waitForResponse((response) =>
    response.url().includes("/export/pdf?preview=1"),
  );
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Preview PDF", exact: true })
    .click();
  const popup = await popupPromise;
  const pdfResponse = await previewResponse;
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()["content-disposition"]).toMatch(/^inline;/);
  expect(await previewDelivery).toMatch(/^blob:/);
  await expect(
    page.getByText("Enable pop-ups to preview the PDF.", { exact: true }),
  ).toHaveCount(0);
  await popup.close();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Teacher-reviewed folk songs lesson");
  await page.getByRole("button", { name: "Save version", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Teacher-reviewed folk songs lesson" }),
  ).toBeVisible({ timeout: 30000 });
  for (const format of ["pdf", "docx"]) {
    const response = await page.request.get(
      `/api/ai-lessons/${lessons.docs[0].id}/export/${format}`,
    );
    expect(response.status()).toBe(200);
    expect((await response.body()).byteLength).toBeGreaterThan(100);
    if (format === "pdf")
      expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  }
});

test("mark all read includes notifications beyond the first hundred", async ({
  page,
}) => {
  const teacher = await account();
  const { db } = emulator();
  const batch = db.batch();
  for (let index = 0; index < 405; index++)
    batch.set(db.doc(`users/${teacher.uid}/notifications/audit-${index}`), {
      read: false,
      message: "A community update",
      href: "/app",
      type: "update",
      createdAt: new Date(),
    });
  await batch.commit();
  await signIn(page, teacher.email);
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId: null, action: "mark-read" }),
        })
      ).status,
  );
  expect(status).toBe(200);
  expect(
    (
      await db
        .collection(`users/${teacher.uid}/notifications`)
        .where("read", "==", false)
        .get()
    ).empty,
  ).toBe(true);
});

test("teachers can save message privacy without resetting their other privacy choices", async ({
  page,
}) => {
  const teacher = await account();
  await signIn(page, teacher.email);
  await page.goto("/settings");
  await page
    .getByLabel("Allow messages from teachers I'm not connected with")
    .check();
  const firstSave = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings") &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  expect((await firstSave).status()).toBe(200);
  await page
    .getByLabel("Show these contact details on my educator profile")
    .check();
  const secondSave = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings") &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  expect((await secondSave).status()).toBe(200);
  const stored = await emulator().db.doc(`userPrivate/${teacher.uid}`).get();
  expect(stored.data()?.privacySettings).toMatchObject({
    shareContactInfo: true,
    allowMessagesFromNonConnections: true,
  });
});
