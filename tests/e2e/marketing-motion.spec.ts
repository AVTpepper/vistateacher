import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const [path, label, count] of [
  ["/", "Explore your educator toolkit", 4],
  ["/pricing", "How your membership works", 3],
  ["/about", "The VistaTeacher approach", 3],
  ["/help", "Find the help you need", 3],
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

test("layered cards retain complete frames and support swiping", async ({
  page,
}) => {
  for (const path of ["/", "/pricing", "/about", "/help"]) {
    await page.goto(path);
    const carousel = page.locator(".story-carousel").first();
    const track = carousel.locator(".story-track");
    await expect(track).toHaveAttribute("data-enhanced", "true");
    await carousel.scrollIntoViewIfNeeded();
    const status = carousel.locator('[aria-live="polite"]');
    await track.dispatchEvent("pointerdown", {
      pointerType: "touch",
      isPrimary: true,
      clientX: 240,
      clientY: 200,
    });
    await track.dispatchEvent("pointerup", {
      pointerType: "touch",
      isPrimary: true,
      clientX: 120,
      clientY: 205,
    });
    await expect(status).toContainText("2 of");
    await expect(
      carousel.locator('.story-slide[data-active="true"]'),
    ).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
    expect(
      await track.evaluate((el) => getComputedStyle(el).perspective),
    ).not.toBe("none");
    const frame = await carousel
      .locator('.story-slide[data-active="true"]')
      .boundingBox();
    const viewportWidth = await page.evaluate(() => innerWidth);
    expect(frame!.x).toBeGreaterThanOrEqual(0);
    expect(frame!.x + frame!.width).toBeLessThanOrEqual(viewportWidth);
    expect(await track.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await expect(
      carousel.locator('.story-slide[data-active="false"]').first(),
    ).toHaveAttribute("inert", "");
    await expect(
      carousel.locator('.story-slide[data-active="false"]').first(),
    ).toHaveAttribute("aria-hidden", "true");
  }
});

test("Help exposes useful actions and keyboard-accessible answers", async ({
  page,
}) => {
  await page.goto("/help");
  await expect(
    page.getByRole("link", { name: "Reset your password", exact: true }),
  ).toHaveAttribute("href", "/forgot-password");
  await page
    .getByRole("button", { name: "Show Privacy and your profile", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Read our privacy guidance" }),
  ).toHaveAttribute("href", "/privacy");
  const question = page
    .locator("summary")
    .filter({ hasText: "How do I verify my email?" });
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(question.locator("..")).toContainText(
    "Open the message sent after registration",
  );
  await expect(
    page.getByRole("heading", { name: "Tell us what you need." }),
  ).toBeVisible();
});

test("card content remains readable without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    for (const path of ["/", "/pricing", "/about", "/help"]) {
      await page.goto(path);
      const carousel = page.locator(".story-carousel").first();
      await expect(carousel.locator(".story-card h3")).toHaveCount(
        path === "/" ? 4 : 3,
      );
      for (const heading of await carousel.locator(".story-card h3").all())
        await expect(heading).toBeVisible();
      await expect(carousel.locator(".story-controls").first()).toBeHidden();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  } finally {
    await context.close();
  }
});
