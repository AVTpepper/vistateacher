import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
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
    throw new Error("Notification checks require demo Firebase emulators.");
  const app =
    getApps().find((app) => app.name === "notification-e2e") ??
    initializeApp({ projectId: "demo-vista-teacher" }, "notification-e2e");
  return { db: getFirestore(app), auth: getAuth(app) };
}
async function teacher() {
  const { db, auth } = emulator();
  const uid = `notifications-${randomUUID()}`;
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
      displayName: "Notification Teacher",
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
async function evidence(page: Page, project: string, name: string) {
  const refresh = page.getByRole("button", { name: "Refresh", exact: true });
  if (await refresh.count()) await expect(refresh).toBeEnabled();
  const directory = `docs/audit/evidence/notifications/${project}`;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
  const scanner = new AxeBuilder({ page }).include("main");
  if (await page.locator("#notification-menu").count())
    scanner.include("#notification-menu");
  const result = await scanner.analyze();
  expect(result.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("uses complete unread totals and server-filtered pages, and preserves unread archive history", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const owner = await teacher();
  const { db } = emulator();
  const batch = db.batch();
  for (let index = 0; index < 195; index++)
    batch.set(db.doc(`users/${owner.uid}/notifications/item-${index}`), {
      read: index >= 160,
      ...(index < 125
        ? index % 2
          ? { archived: false }
          : {}
        : { archived: index < 160 }),
      createdAt: new Date(Date.now() - 300_000 + index * 1000),
      type: "post-comment",
      actorId: `teacher-${index}`,
      actorName: `Teacher ${index}`,
      entityId: `post-${index}`,
      message: `Teacher ${index} shared a classroom reflection with you.`,
      href: "/app",
    });
  await batch.commit();
  await signIn(page, owner.email);
  await expect(
    page.getByRole("button", {
      name: "Notifications, 125 unread",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await expect(
    page.getByText("125 unread notifications", { exact: true }),
  ).toBeVisible();
  await page.goto("/notifications");
  await expect(
    page.getByText("125 unread notifications in your inbox."),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(30);
  await expect(
    page
      .getByRole("article")
      .first()
      .getByRole("button", { name: "Mark as unread", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(page.getByRole("article").first()).toContainText("Teacher 124");
  await evidence(page, testInfo.project.name, "unread");
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(60);
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Notifications, 124 unread",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(30);
  await evidence(page, testInfo.project.name, "archived");
  await expect(
    page.getByRole("button", { name: "Mark all read", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await page
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Notifications", exact: true }),
  ).toBeVisible();
  expect(
    (await db.doc(`users/${owner.uid}/notifications/item-124`).get()).data(),
  ).toMatchObject({ archived: true, read: false });
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(page.getByText("You're all caught up")).toBeVisible();
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  // Restore the newly archived unread row via the same owner-scoped API.
  const restored = await page.evaluate(
    async () =>
      (
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notificationId: "item-124",
            action: "restore",
          }),
        })
      ).status,
  );
  expect(restored).toBe(200);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Notifications, 1 unread", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Notifications, 1 unread", exact: true })
    .click();
  await expect(
    page
      .getByLabel("Recent notifications")
      .getByText("1 unread", { exact: true }),
  ).toBeVisible();
  await evidence(page, testInfo.project.name, "menu");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Notifications, 1 unread", exact: true }),
  ).toBeFocused();
});

test("keeps the last known count on a refresh failure and offers recovery", async ({
  page,
}, testInfo) => {
  const owner = await teacher();
  const { db } = emulator();
  await db.doc(`users/${owner.uid}/notifications/one`).set({
    read: false,
    archived: false,
    type: "update",
    message: "A saved community update",
    href: "/app",
    createdAt: new Date(),
  });
  await signIn(page, owner.email);
  const trigger = page.getByRole("button", {
    name: "Notifications, 1 unread",
    exact: true,
  });
  await expect(trigger).toBeVisible();
  await page.route("**/api/notifications*", (route) => route.abort("failed"));
  await trigger.click();
  await expect(
    page.getByRole("button", {
      name: "Notifications, 1 unread, updates unavailable",
      exact: true,
    }),
  ).toBeVisible();
  const menu = page.getByLabel("Recent notifications");
  await expect(menu.getByText("Updates may be out of date.")).toBeVisible();
  await expect(menu.getByText("A saved community update")).toBeVisible();
  await evidence(page, testInfo.project.name, "recovery");
  await page.unroute("**/api/notifications*");
  await menu.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Notifications, 1 unread", exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(0);
});

test("saves the in-app preference and describes the available delivery channels honestly", async ({
  page,
}, testInfo) => {
  const owner = await teacher();
  await signIn(page, owner.email);
  await page.goto("/settings");
  await page.getByLabel("In-app notifications").uncheck();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings") &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.getByLabel("In-app notifications")).not.toBeChecked();
  await expect(
    page.getByText(/Community email updates are not available yet/),
  ).toBeVisible();
  await evidence(page, testInfo.project.name, "settings");
  expect(
    (await emulator().db.doc(`userPrivate/${owner.uid}`).get()).data()
      ?.notificationSettings.inApp,
  ).toBe(false);
});
