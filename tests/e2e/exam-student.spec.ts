import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD } from "./accounts";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Student exam flow with timer", () => {
  test.skip(({ isMobile }) => isMobile, "full flow runs once on desktop; shares one attempt per student");

  test("dashboard, start, answer, reload, submit, result, and no second start", async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email);
    await expect(page.getByText("مادة اختبار").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /اختبار سريع E2E/ })).toBeVisible();

    await page.getByRole("link", { name: /اختبار سريع E2E/ }).click();
    await page.getByRole("button", { name: "ابدأ الامتحان" }).click();
    await expect(page).toHaveURL(/\/attempts\/[A-Za-z0-9_-]+$/);

    const timer = page.getByRole("timer");
    await expect(timer).toBeVisible();
    await expect(timer).toHaveText(/\d{2}:\d{2}/);

    // Answer Q1 with the correct option (b). Autosave confirms.
    await page.getByRole("radio").nth(1).check();
    await expect(page.getByText("تم الحفظ")).toBeVisible();

    // Reload: the saved answer comes back from the server.
    await page.reload();
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.getByRole("radio").nth(1)).toBeChecked();

    // Q2 correct option (a), then submit.
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByRole("radio").nth(0).check();
    await expect(page.getByText("تم الحفظ")).toBeVisible();

    await page.getByRole("button", { name: "تسليم الامتحان" }).click();
    await page.getByRole("dialog", { name: "تسليم الامتحان؟" }).getByRole("button", { name: "تسليم", exact: true }).click();

    // Result: 5 of 5 (Q1 2 points + Q2 3 points)
    await expect(page.getByText("تم تسليم الامتحان")).toBeVisible();
    await expect(page.getByText(/5\s*\/\s*5/).first()).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();

    // Reload keeps the result.
    await page.reload();
    await expect(page.getByText("100%")).toBeVisible();

    // Exam page now offers the result, not a second start.
    await page.goto(page.url().replace(/\/attempts\/.*/, "/exams/e2e-exam"));
    await expect(page.getByRole("button", { name: "ابدأ الامتحان" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "عرض النتيجة" })).toBeVisible();
  });

  test("anonymous visitor cannot open an attempt", async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email);
    await page.goto("/exams/e2e-exam");
    const attemptHref = await page.getByRole("link", { name: /متابعة الامتحان|عرض النتيجة/ }).getAttribute("href");
    await page.context().clearCookies();
    await page.goto(attemptHref ?? "/attempts/none");
    await expect(page).toHaveURL(/\/login/);
  });
});
