import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD } from "./accounts";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/(dashboard|admin)$/, { timeout: 15000 });
}

test.describe("Camera monitoring (live, no storage)", () => {
  test.skip(({ isMobile }) => isMobile, "runs once on desktop");

  test("student starts exam with camera; admin sees the live feed", async ({ browser }) => {
    const studentCtx = await browser.newContext({ locale: "ar-EG" });
    const adminCtx = await browser.newContext({ locale: "ar-EG" });
    const student = await studentCtx.newPage();
    const admin = await adminCtx.newPage();

    await signIn(student, ACCOUNTS.monitor.email);
    await student.goto("/exams/e2e-exam");
    await student.getByRole("button", { name: "ابدأ الامتحان" }).click();
    await expect(student).toHaveURL(/\/attempts\/[A-Za-z0-9_-]+$/);
    await expect(student.getByText("الكاميرا تعمل")).toBeVisible({ timeout: 20000 });

    await signIn(admin, ACCOUNTS.admin.email);
    await admin.goto("/admin/monitor");
    await admin.getByRole("link", { name: /اختبار سريع E2E/ }).first().click();
    await expect(admin.getByText("مباشر")).toBeVisible({ timeout: 60000 });

    await studentCtx.close();
    await adminCtx.close();
  });
});
