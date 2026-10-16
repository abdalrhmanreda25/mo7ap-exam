export const ROLES = ["ADMIN", "STUDENT"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function homePathFor(role: Role): string {
  return role === "ADMIN" ? "/admin" : "/dashboard";
}

/**
 * Accepts only same-site relative paths. Blocks open redirects such as
 * "//evil.example" or "https://evil.example".
 */
export function safeNextPath(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return null;
  if (candidate.includes("\\")) return null;
  return candidate;
}
