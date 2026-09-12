import { test as base, expect, type Page } from "@playwright/test";

export const TEACHER_CREDENTIALS = {
  email: "teacher@proctored.internal",
  password: process.env.SEED_TEACHER_PASSWORD || "teacher123",
};

export async function loginAsTeacher(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"], input[name="email"]', TEACHER_CREDENTIALS.email);
  await page.fill('input[type="password"], input[name="password"]', TEACHER_CREDENTIALS.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10000 });
}

export const test = base.extend({
  // Custom test fixtures can be added here
});

export { expect };
