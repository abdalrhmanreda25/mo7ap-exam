/** Expected business-rule failure. Its message is user-facing Arabic and safe to return. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "DomainError";
  }
}
