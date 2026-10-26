import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, E2E_EXAM_CODE, TEST_PASSWORD } from "./accounts";

async function signIn(page: Page, email: string, home: RegExp) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByLabel("البريد الإلكتروني").fill(email);
    await page.getByLabel("كلمة المرور").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    try {
      await expect(page).toHaveURL(home, { timeout: 8000 });
      return;
    } catch {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
    }
  }
  await expect(page).toHaveURL(home);
}

test("admin sees the exam access code with copy and regenerate controls", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin.email, /\/admin$/);
  await page.goto("/admin/exams/e2e-exam");
  await expect(page.getByRole("heading", { name: "كود الدخول" })).toBeVisible();
  await expect(page.getByLabel("كود الامتحان")).toHaveText(E2E_EXAM_CODE);
  await expect(page.getByRole("button", { name: "نسخ الكود" })).toBeVisible();
  // Regenerating would break the code other specs type, so only check the control exists.
  await expect(page.getByRole("button", { name: "توليد كود جديد" })).toBeVisible();
});

test("admin sees the ready exams with an add button for each", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin.email, /\/admin$/);
  await page.goto("/admin/exams");
  await expect(page.getByRole("heading", { name: "امتحانات جاهزة" })).toBeVisible();
  await expect(page.getByText("امتحان الأحياء - الباب الثاني: التنسيق الهرموني (صعب جدًا)")).toBeVisible();
  await expect(page.getByRole("button", { name: "إضافة ونشر" })).toHaveCount(3);
});
