import { DomainError } from "@/lib/server/errors";

/**
 * Teacher spaces. Every document a teacher creates carries workspaceId, every list filters by it,
 * and every single-document read checks it. A teacher never sees another teacher's data.
 */
export interface Actor {
  uid: string;
  workspaceId: string;
}

/** The space that holds everything created before spaces existed. */
export const MAIN_WORKSPACE_ID = "main";

/** Workspace of a stored document. Documents saved before spaces existed belong to the main space. */
export function workspaceOf(data: { workspaceId?: unknown } | undefined): string {
  return typeof data?.workspaceId === "string" && data.workspaceId ? data.workspaceId : MAIN_WORKSPACE_ID;
}

/** Another space's document reads exactly like a missing one, so IDs leak nothing. */
export function assertInWorkspace(
  data: { workspaceId?: unknown } | undefined,
  workspaceId: string,
  notFound: string,
): asserts data is { workspaceId?: unknown } & Record<string, unknown> {
  if (!data || workspaceOf(data) !== workspaceId) throw new DomainError(notFound);
}

export function inWorkspace(data: { workspaceId?: unknown } | undefined, workspaceId: string): boolean {
  return Boolean(data) && workspaceOf(data) === workspaceId;
}
