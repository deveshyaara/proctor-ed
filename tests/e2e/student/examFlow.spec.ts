import { test, expect } from "@playwright/test";

test.describe("Student Exam Flow Gateway", () => {
  test("renders student gateway page with code input and start action", async ({ page }) => {
    await page.goto("/");

    const codeInput = page.locator('input[placeholder*="CODE" i], input[type="text"]');
    const startButton = page.locator('button[type="submit"]');

    await expect(codeInput).toBeVisible();
    await expect(startButton).toBeVisible();
  });

  test("shows validation error when entering an empty or short test code", async ({ page }) => {
    await page.goto("/");

    const startButton = page.locator('button[type="submit"]');
    await startButton.click();

    // Error feedback should be shown
    const errorText = page.locator('[role="alert"], [class*="error"], .text-red-400, .text-rose-500');
    await expect(errorText.first()).toBeVisible();
  });

  test("shows clear error when test code does not exist", async ({ page }) => {
    await page.goto("/");

    const codeInput = page.locator('input[placeholder*="CODE" i], input[type="text"]');
    await codeInput.fill("NONEXIST99");

    const startButton = page.locator('button[type="submit"]');
    await startButton.click();

    // Server should return 404 and page should show descriptive error
    const errorNotice = page.locator('[role="alert"], [class*="error"], .text-red-400, .text-rose-500');
    await expect(errorNotice.first()).toBeVisible({ timeout: 5000 });
  });
});
