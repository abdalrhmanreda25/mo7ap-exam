import { expect, test } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD } from "./accounts";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
}

test.describe("Phase 1: authentication and route protection", () => {
  test("document is Arabic RTL", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("protected route redirects anonymous visitor to login with next", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard|\/login\?next=\/dashboard/);
  });

  test("student signs in, reaches dashboard, and survives reload", async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("أهلًا");

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("student is refused on admin area with the unauthorized page", async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/unauthorized$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("لا تملك صلاحية الوصول");
  });

  test("admin signs in and lands on admin home", async ({ page }) => {
    await signIn(page, ACCOUNTS.admin.email, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("مرحبًا");
  });

  test("wrong password shows Arabic error and stays on login", async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email, "wrong-password-123");
    await expect(page.getByRole("alert").filter({ hasText: "كلمة المرور غير صحيحة" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("deactivated account cannot sign in", async ({ page }) => {
    await signIn(page, ACCOUNTS.disabled.email, TEST_PASSWORD);
    await expect(page.getByRole("alert").filter({ hasText: "غير مفعل" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("sign-out clears the session and blocks protected pages", async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("forgot-password shows neutral confirmation for any address", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("البريد الإلكتروني").fill("unknown-person@example.test");
    await page.getByRole("button", { name: "إرسال رابط إعادة التعيين" }).click();
    await expect(page.getByRole("status")).toContainText("إذا كان البريد مسجلًا");
  });

  test("login layout has no horizontal overflow on this viewport", async ({ page }) => {
    await page.goto("/login");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});

test.describe("Phase 1: session API boundaries", () => {
  test("rejects cross-origin session creation", async ({ request, baseURL }) => {
    const response = await request.post(`${baseURL}/api/auth/session`, {
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      data: { idToken: "forged" },
    });
    expect(response.status()).toBe(403);
    expect(response.headers()["set-cookie"] ?? "").not.toContain("__session");
  });

  test("rejects non-JSON and forged tokens without setting a cookie", async ({ request, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3100";
    const wrongType = await request.post(`${origin}/api/auth/session`, {
      headers: { "Content-Type": "text/plain", Origin: origin },
      data: "idToken=x",
    });
    expect(wrongType.status()).toBe(415);

    const forged = await request.post(`${origin}/api/auth/session`, {
      headers: { "Content-Type": "application/json", Origin: origin },
      data: { idToken: "not-a-real-token" },
    });
    expect(forged.status()).toBe(401);
    expect(forged.headers()["set-cookie"] ?? "").not.toContain("__session");
  });

  test("forged session cookie does not grant access", async ({ context, page }) => {
    await context.addCookies([
      { name: "__session", value: "forged-cookie", domain: "localhost", path: "/", httpOnly: true },
    ]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });
});
