import { randomInt } from "node:crypto";

/** No 0/O, 1/I/L: the student copies the code by eye from the admin. */
export const ACCESS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ACCESS_CODE_LENGTH = 6;

export function makeAccessCode(): string {
  let code = "";
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) code += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)];
  return code;
}

/** Accepts the code as typed: any case, with spaces or dashes. */
export function normalizeAccessCode(input: string): string {
  return input.replace(/[\s-]+/g, "").toUpperCase();
}
