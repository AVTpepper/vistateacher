import { expect, test } from "@playwright/test";

test("renders the VistaTeacher marketing foundation", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "The network built for teachers." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/VistaTeacher/);
});
