/** Fixed emulator-only test accounts. Never used against a real project. */
export const TEST_PASSWORD = "Emulator-only-1234";

export const ACCOUNTS = {
  student: { email: "student-e2e@example.test", name: "طالب تجريبي", role: "STUDENT" },
  admin: { email: "admin-e2e@example.test", name: "مشرف تجريبي", role: "ADMIN" },
  disabled: { email: "disabled-e2e@example.test", name: "حساب موقوف", role: "STUDENT" },
} as const;
