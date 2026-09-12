import { test, expect } from "@playwright/test";

test.describe("Teacher Authentication Flow", () => {
  test("renders login page with email, password, and submit button", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveTitle(/ProctorED/i);
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();
  });

  test("shows validation error on invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.fill('input[type="email"], input[name="email"]', "unknown@teacher.internal");
    await page.fill('input[type="password"], input[name="password"]', "WrongPassword123!");
    await page.click('button[type="submit"]');

    // Should display error message
    const errorAlert = page.locator('[role="alert"], .text-red-500, .text-destructive, [class*="error"]');
    await expect(errorAlert.first()).toBeVisible({ timeout: 5000 });
  });

  test("redirects unauthenticated users trying to access /dashboard to /login", async ({ page }) => {
    await page.goto("/dashboard");

    // Must be redirected to /login with callbackUrl
    await expect(page).toHaveURL(/\/login/);
  });
});
