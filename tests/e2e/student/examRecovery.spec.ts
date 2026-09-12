import { test, expect } from "@playwright/test";

test.describe("Student Exam Recovery and Setup Guard", () => {
  test("shows clear recovery message when visiting setup without an attemptId", async ({ page }) => {
    await page.goto("/exam/TEST1234/setup");

    // Must warn user of missing session and offer return link
    const warningText = page.locator("text=Missing exam session ID");
    await expect(warningText).toBeVisible();

    const returnLink = page.locator("a", { hasText: "Return to Identity Entry" });
    await expect(returnLink).toBeVisible();
  });
});
