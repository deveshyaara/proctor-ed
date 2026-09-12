import { test, expect } from "@playwright/test";

test.describe("Teacher Test Management Protection", () => {
  test("redirects unauthenticated access to /tests to /login", async ({ page }) => {
    await page.goto("/tests");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects unauthenticated access to /tests/create to /login", async ({ page }) => {
    await page.goto("/tests/create");
    await expect(page).toHaveURL(/\/login/);
  });
});
