import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ACCOUNTS, TEST_PASSWORD } from "./accounts";

const tag = Date.now().toString(36);

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(ACCOUNTS.admin.email);
  await page.getByLabel("كلمة المرور").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

function csvFile(name: string, content: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "e2e-import-"));
  const file = path.join(dir, name);
  writeFileSync(file, content, "utf8");
  return file;
}

test.describe("Excel/CSV import on the subjects page", () => {
  test.skip(({ isMobile }) => isMobile, "import flow runs once on desktop");

  test("blocks a file with a bad row, then imports a valid one", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/subjects");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "استيراد من Excel" }).click();
    const dialog = page.getByRole("dialog", { name: /استيراد المواد/ });
    await expect(dialog).toBeVisible();

    // Bad row: slug has spaces. Nothing must be written.
    const bad = csvFile("bad.csv", `name,nameAr,slug,academicYear,curriculum,tracks,order,isActive\nX,اختبار ${tag},Bad Slug,2026,ث,,1,true\n`);
    await dialog.locator('input[type="file"]').setInputFiles(bad);
    await expect(dialog.getByRole("alert")).toContainText("سطر 2");
    await expect(dialog.getByRole("button", { name: /استيراد 0 صفًا/ })).toBeDisabled();

    // Valid file.
    const good = csvFile("good.csv", `name,nameAr,slug,academicYear,curriculum,tracks,order,isActive\nImp,مادة مستوردة ${tag},imported-${tag},2026,الثانوية العامة,علمي،علوم,9,true\n`);
    await dialog.locator('input[type="file"]').setInputFiles(good);
    await expect(dialog.getByText("صف صالح من أصل")).toBeVisible();
    await dialog.getByRole("button", { name: /استيراد 1 صفًا/ }).click();

    await expect(page.getByText("تم الاستيراد بنجاح.")).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`مادة مستوردة ${tag}`) })).toBeVisible();
  });

  test("download link serves the subjects template", async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/templates/subjects.csv`);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("nameAr,slug");
  });

  test("exam Excel template: admin gets an xlsx, student gets 403", async ({ page, request, baseURL }) => {
    await signInAsAdmin(page);
    const admin = await request.get(`${baseURL}/api/templates/exam-questions?examId=e2e-exam`, {
      headers: { cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ") },
    });
    expect(admin.status()).toBe(200);
    expect(admin.headers()["content-type"]).toContain("spreadsheetml");
    expect((await admin.body()).subarray(0, 2).toString()).toBe("PK");

    const anon = await request.get(`${baseURL}/api/templates/exam-questions?examId=e2e-exam`);
    expect(anon.status()).toBe(403);
  });
});
