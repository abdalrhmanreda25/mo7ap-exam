/** Result shape returned by every admin server action. Safe to pass to client components. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; issues?: string[] };
