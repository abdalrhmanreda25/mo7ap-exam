import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD } from "./accounts";

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

// Runs after exam-student.spec.ts, which leaves the seeded student with a finished e2e-exam attempt.
test.describe("Admin: students, reopen exam, camera grid", () => {
  test.skip(({ isMobile }) => isMobile, "runs once on desktop");

  test("admin reopens a finished exam for one student; history is kept; student can start again", async ({ browser }) => {
    test.setTimeout(120_000);
    const adminCtx = await browser.newContext({ locale: "ar-EG" });
    const admin = await adminCtx.newPage();
    await signIn(admin, ACCOUNTS.admin.email, /\/admin$/);

    await admin.goto("/admin/students");
    await admin.waitForLoadState("networkidle");
    await admin.getByRole("link", { name: new RegExp(ACCOUNTS.student.name) }).click();
    await expect(admin).toHaveURL(/\/admin\/students\/[A-Za-z0-9_-]+$/, { timeout: 15000 });
    await expect(admin.getByText("اختبار سريع E2E")).toBeVisible();

    await admin.getByRole("button", { name: "إعادة فتح الامتحان" }).first().click();
    const dialog = admin.getByRole("dialog", { name: "السماح للطالب بإعادة الامتحان؟" });
    await dialog.getByLabel("السبب (يُحفظ في سجل التدقيق)").fill("إعادة تجريبية");
    await dialog.getByRole("button", { name: "إعادة الفتح" }).click();
    await expect(admin.getByText("تم فتح الامتحان للطالب من جديد.")).toBeVisible();
    await expect(admin.getByText("محاولات سابقة (محفوظة)")).toBeVisible();

    await admin.goto("/admin/monitor/all");
    await expect(admin.getByRole("heading", { name: "كل الكاميرات" })).toBeVisible();
    await adminCtx.close();

    const studentCtx = await browser.newContext({ locale: "ar-EG" });
    const student = await studentCtx.newPage();
    await signIn(student, ACCOUNTS.student.email, /\/dashboard$/);
    await student.goto("/exams/e2e-exam");
    await expect(student.getByRole("button", { name: "ابدأ الامتحان" })).toBeVisible();
    await studentCtx.close();
  });
});
