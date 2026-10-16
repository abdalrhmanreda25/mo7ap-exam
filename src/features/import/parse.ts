import readXlsxFile from "read-excel-file/node";
import { DomainError } from "@/lib/server/errors";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;

export interface ImportRow {
  /** Spreadsheet line number, 1-based, header is line 1. Used in error messages. */
  line: number;
  /** Values keyed by normalized header (lowercase, no spaces or punctuation). */
  values: Record<string, string>;
}

/** "subjectSlug", "Subject Slug" and "subject_slug" all become "subjectslug". */
export function normalizeHeader(header: string): string {
  return header.replace(/^﻿/, "").toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, "");
}

/** RFC 4180 style CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Accepts the first sheet whether the library returns a sheet object or an array of sheets. */
function firstSheetRows(parsed: unknown): unknown[][] {
  const sheet = Array.isArray(parsed) ? parsed[0] : parsed;
  if (sheet && typeof sheet === "object" && "data" in sheet) {
    return (sheet as { data: unknown[][] }).data;
  }
  return Array.isArray(sheet) ? (sheet as unknown[][]) : [];
}

export async function parseImportFile(file: File): Promise<ImportRow[]> {
  if (file.size === 0) throw new DomainError("الملف فارغ.");
  if (file.size > MAX_IMPORT_BYTES) throw new DomainError("حجم الملف أكبر من 2 ميجابايت.");

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  let table: string[][];
  if (name.endsWith(".csv")) {
    table = parseCsv(buffer.toString("utf8"));
  } else if (name.endsWith(".xlsx")) {
    table = firstSheetRows(await readXlsxFile(buffer)).map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))),
    );
  } else {
    throw new DomainError("الصيغ المدعومة: .xlsx أو .csv");
  }

  if (table.length < 2) throw new DomainError("الملف لا يحتوي صفوف بيانات تحت صف العناوين.");
  const headers = table[0].map(normalizeHeader);

  const rows: ImportRow[] = [];
  table.slice(1).forEach((cells, index) => {
    if (cells.every((cell) => cell.trim() === "")) return;
    const values: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (header) values[header] = (cells[column] ?? "").trim();
    });
    rows.push({ line: index + 2, values });
  });

  if (rows.length === 0) throw new DomainError("لا توجد صفوف بيانات.");
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new DomainError(`الحد الأقصى ${MAX_IMPORT_ROWS} صفًا في الملف الواحد.`);
  }
  return rows;
}
