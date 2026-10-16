import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const [path, label, count] of [
  ["/", "Explore your educator toolkit", 4],
  ["/pricing", "How your membership works", 3],
] as const) {
  test(`${path} carousel supports buttons, keyboard, and reduced motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    const carousel = page.getByRole("region", { name: label, exact: true });
    await carousel.scrollIntoViewIfNeeded();
    const status = carousel.locator('[aria-live="polite"]');
    await expect(status).toContainText(`1 of ${count}`);
    await expect(
      carousel.getByRole("button", { name: `Previous card in ${label}` }),
    ).toBeDisabled();
    await carousel
      .getByRole("button", { name: `Next card in ${label}` })
      .click();
    await expect(status).toContainText(`2 of ${count}`);
    const track = carousel.getByRole("list", {
      name: `${label} cards`,
      exact: true,
    });
    await track.focus();
    await page.keyboard.press("End");
    await expect(status).toContainText(`${count} of ${count}`);
    await expect(
      carousel.getByRole("button", { name: `Next card in ${label}` }),
    ).toBeDisabled();
    await page.keyboard.press("Home");
    await expect(status).toContainText(`1 of ${count}`);
    await carousel.locator(".story-dot").last().click();
    await expect(status).toContainText(`${count} of ${count}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const section = carousel.locator("xpath=ancestor::section[1]");
    await expect(section).toHaveCSS("animation-name", "none");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}

test("billing questions expand with native keyboard controls", async ({
  page,
}) => {
  await page.goto("/pricing");
  const question = page
    .locator("summary")
    .filter({ hasText: "Cancel without losing paid time" });
  const detail = question.locator("..");
  await expect(detail).not.toHaveAttribute("open");
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(detail).toHaveAttribute("open", "");
  await expect(detail).toContainText(
    "Plus remains active through the current billing period.",
  );
});
