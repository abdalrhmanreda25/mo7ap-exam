import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD } from "./accounts";

const tag = `${Date.now().toString(36)}`;

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  // Retry once: a click before React hydrates is lost and the page stays on /login.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByLabel("البريد الإلكتروني").fill(ACCOUNTS.admin.email);
    await page.getByLabel("كلمة المرور").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    try {
      await expect(page).toHaveURL(/\/admin$/, { timeout: 8000 });
      return;
    } catch {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
    }
  }
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe("Phase 3: admin builds curriculum, bank, and publishes an exam", () => {
  test.skip(({ isMobile }) => isMobile, "full workflow runs once on desktop");

  test("subject, chapter, lesson, question, exam, publish", async ({ page }) => {
    await signInAsAdmin(page);

    // 1. Subject
    await page.goto("/admin/subjects/new");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("اسم المادة بالعربية").fill(`فيزياء ${tag}`);
    await page.getByLabel("المعرّف المختصر").fill(`physics-${tag}`);
    await page.getByLabel("السنة الدراسية").fill("2026");
    await page.getByLabel("المنهج").fill("ثانوية عامة");
    await page.getByRole("button", { name: "إضافة المادة" }).click();
    await expect(page).toHaveURL(/\/admin\/subjects\/[A-Za-z0-9_-]+$/);

    // 2. Chapter and lesson
    await page.locator("#chapter-new-titleAr").fill("الحركة");
    await page.getByRole("button", { name: "إضافة الفصل", exact: true }).click();
    await expect(page.getByRole("heading", { name: "الحركة" })).toBeVisible();

    await page.getByText("إضافة درس إلى هذا الفصل").click();
    await page.locator("#lesson-new-titleAr").fill("السرعة المتوسطة");
    await page.getByRole("button", { name: "إضافة الدرس", exact: true }).click();
    await expect(page.getByText("السرعة المتوسطة")).toBeVisible();

    // 3. Question (blocked without key first, then valid)
    await page.goto("/admin/questions/new");
    await page.waitForLoadState("networkidle");
    await page.locator("#subjectId").selectOption({ label: `فيزياء ${tag}` });
    await page.locator("#chapterId").selectOption({ label: "الحركة" });
    await page.locator("#lessonId").selectOption({ label: "السرعة المتوسطة" });
    await page.locator("#statementAr").fill("ما وحدة قياس السرعة في النظام الدولي؟");
    await page.locator("#statement").fill("SI unit of speed?");
    await page.getByLabel("الخيار 1 بالعربية").fill("م/ث");
    await page.getByLabel("الخيار 1 بالإنجليزية").fill("m/s");
    await page.getByLabel("الخيار 2 بالعربية").fill("كم");
    await page.getByLabel("الخيار 2 بالإنجليزية").fill("km");
    await page.getByLabel("الخيار 3 بالعربية").fill("كغ");
    await page.getByLabel("الخيار 3 بالإنجليزية").fill("kg");
    await page.getByLabel("الخيار 4 بالعربية").fill("ثانية");
    await page.getByLabel("الخيار 4 بالإنجليزية").fill("s");
    await page.getByLabel("الخيار 1 صحيح").check();
    await page.locator("#status").selectOption("READY");
    await page.getByRole("button", { name: "إضافة السؤال" }).click();
    await expect(page).toHaveURL(/\/admin\/questions\/[A-Za-z0-9_-]+$/);
    await expect(page.getByText("محتوى مقفل")).toHaveCount(0);

    // 4. Exam draft
    await page.goto("/admin/exams/new");
    await page.waitForLoadState("networkidle");
    await page.locator("#titleAr").fill(`اختبار الحركة ${tag}`);
    await page.locator("#title").fill(`Motion quiz ${tag}`);
    await page.locator("#subjectId").selectOption({ label: `فيزياء ${tag}` });
    await page.locator("#academicYear").fill("2026");
    await page.getByRole("button", { name: "إنشاء مسودة" }).click();
    await expect(page).toHaveURL(/\/admin\/exams\/[A-Za-z0-9_-]+$/);
    // Regression guard: client navigation must not leave the create form mounted next to the detail view.
    await expect(page.locator("#titleAr")).toHaveCount(1);

    // Publish is blocked while empty
    await expect(page.getByRole("alert").filter({ hasText: "لا يحتوي أسئلة" })).toBeVisible();
    await expect(page.getByRole("button", { name: "نشر الامتحان" })).toBeDisabled();

    // 5. Compose from the bank
    await page.locator("#pick").selectOption({ index: 1 });
    await page.locator("#pick-points").fill("2");
    await page.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(page.getByText("تمت إضافة السؤال.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "ما وحدة قياس السرعة" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "لا يحتوي أسئلة" })).toHaveCount(0);

    // 6. Publish behind a confirmation dialog
    await page.getByRole("button", { name: "نشر الامتحان" }).click();
    const dialog = page.getByRole("dialog", { name: "نشر الامتحان؟" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "نشر", exact: true }).click();
    await expect(page.getByText("تم نشر الامتحان.")).toBeVisible();
    await expect(page.getByText("منشور", { exact: true }).first()).toBeVisible();

    // Published: settings locked, no more composition. Checked on a fresh load to rule out client-side leftovers.
    await page.reload();
    await expect(page.getByRole("button", { name: "إضافة", exact: true })).toHaveCount(0);
    await expect(page.locator("#titleAr")).toHaveCount(1);
    await expect(page.locator("#titleAr")).toBeDisabled();

    // Bank list loads and marks the question locked now that a published exam holds it.
    await page.goto("/admin/questions");
    const row = page.getByRole("listitem").filter({ hasText: "ما وحدة قياس السرعة" }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText("مقفل", { exact: true })).toBeVisible();
  });

  test("an empty new exam starts with publish disabled", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/exams/new");
    await page.waitForLoadState("networkidle");
    await page.locator("#titleAr").fill(`امتحان فارغ ${tag}`);
    await page.locator("#title").fill(`Empty ${tag}`);
    await page.locator("#subjectId").selectOption({ index: 1 });
    await page.locator("#academicYear").fill("2026");
    await page.getByRole("button", { name: "إنشاء مسودة" }).click();
    await expect(page).toHaveURL(/\/admin\/exams\/[A-Za-z0-9_-]+$/);
    await expect(page.getByRole("button", { name: "نشر الامتحان" })).toBeDisabled();
  });
});

test.describe("Phase 3: admin layouts on small screens", () => {
  test.skip(({ isMobile }) => !isMobile, "layout check runs on mobile only");

  test("question builder and exam list have no horizontal overflow", async ({ page }) => {
    await signInAsAdmin(page);
    for (const path of ["/admin/questions/new", "/admin/exams", "/admin/subjects"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, path).toBe(false);
    }
  });
});
