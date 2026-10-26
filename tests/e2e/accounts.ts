/** Fixed emulator-only test accounts. Never used against a real project. */
export const TEST_PASSWORD = "Emulator-only-1234";

/** Access code seeded for e2e-exam by scripts/seed-e2e.ts. */
export const E2E_EXAM_CODE = "E2EK7P";

export const ACCOUNTS = {
  student: { email: "student-e2e@example.test", name: "طالب تجريبي", role: "STUDENT" },
  admin: { email: "admin-e2e@example.test", name: "مشرف تجريبي", role: "ADMIN" },
  monitor: { email: "monitor-e2e@example.test", name: "طالب المراقبة", role: "STUDENT" },
  disabled: { email: "disabled-e2e@example.test", name: "حساب موقوف", role: "STUDENT" },
} as const;
