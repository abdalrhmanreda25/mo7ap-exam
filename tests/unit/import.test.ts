import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeHeader, parseCsv, parseImportFile } from "@/features/import/parse";
import { mapChapters, mapExamQuestions, mapQuestions, mapSubjects, missingColumns } from "@/features/import/mappers";
import type { ImportRow } from "@/features/import/parse";

const row = (line: number, values: Record<string, string>): ImportRow => ({ line, values });

describe("CSV parsing", () => {
  it("handles quoted commas, escaped quotes, and CRLF", () => {
    const rows = parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n');
    expect(rows).toEqual([["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
  });

  it("normalizes headers so casing and spaces do not matter", () => {
    expect(normalizeHeader("Subject Slug")).toBe("subjectslug");
    expect(normalizeHeader("﻿subjectSlug")).toBe("subjectslug");
    expect(normalizeHeader("اسم المادة")).toBe("اسمالمادة");
  });
});

describe("real .xlsx parsing", () => {
  it("reads the first sheet of a generated workbook", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "import-"));
    const file = path.join(dir, "chapters.xlsx");
    execFileSync("python3", ["-c", `
import openpyxl, sys
wb = openpyxl.Workbook(); ws = wb.active
ws.append(["subjectSlug","titleAr","title","order","isActive"])
ws.append(["physics","الحركة","Motion",1,"true"])
ws.append(["physics","الكهرباء","Electricity",2,"نعم"])
wb.save(sys.argv[1])`, file]);
    const bytes = readFileSync(file);
    const upload = new File([bytes], "chapters.xlsx");
    const rows = await parseImportFile(upload);
    expect(rows).toHaveLength(2);
    expect(rows[0].values).toMatchObject({ subjectslug: "physics", titlear: "الحركة", order: "1" });
    expect(rows[0].line).toBe(2);
  });

  it("rejects unsupported extensions", async () => {
    await expect(parseImportFile(new File(["x"], "data.pdf"))).rejects.toThrow("الصيغ المدعومة");
  });

  it("rejects a file with only headers", async () => {
    await expect(parseImportFile(new File(["a,b\n"], "empty.csv"))).rejects.toThrow("لا يحتوي صفوف");
  });
});

describe("subject rows", () => {
  it("maps a valid row and splits tracks in Arabic or English punctuation", () => {
    const [out] = mapSubjects([
      row(2, { name: "Physics", namear: "الفيزياء", slug: "physics", academicyear: "2026", curriculum: "ث", tracks: "علمي، علوم;رياضة", order: "3", isactive: "true" }),
    ]);
    expect(out).toMatchObject({ ok: true, value: { slug: "physics", order: 3, applicableTracks: ["علمي", "علوم", "رياضة"] } });
  });

  it("reports the line and the field problem for a bad row", () => {
    const [out] = mapSubjects([row(5, { namear: "x", slug: "Bad Slug!", academicyear: "2026", curriculum: "ث" })]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.line).toBe(5);
      expect(out.message).toContain("المعرّف المختصر");
    }
  });

  it("rejects an unreadable boolean with the value in the message", () => {
    const [out] = mapSubjects([row(3, { namear: "x", slug: "ok-slug", academicyear: "2026", curriculum: "ث", isactive: "maybe" })]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toContain("maybe");
  });
});

describe("chapter and lesson references", () => {
  it("fails a chapter whose subject slug is unknown", () => {
    const [out] = mapChapters([row(2, { subjectslug: "ghost", titlear: "فصل" })], new Map([["physics", "id1"]]));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toContain("ghost");
  });
});

describe("question rows", () => {
  const refs = {
    subjectIdBySlug: new Map([["physics", "s1"]]),
    chapterByKey: new Map([["physics|الحركة", { id: "c1", subjectId: "s1" }]]),
    lessonByKey: new Map([["physics|الحركة|السرعة", { id: "l1", chapterId: "c1", subjectId: "s1" }]]),
  };
  const base = {
    subjectslug: "physics", chaptertitlear: "الحركة", lessontitlear: "السرعة", type: "single_choice",
    difficulty: "easy", status: "ready", statementar: "ما الوحدة؟", statement: "Unit?",
    option1ar: "م/ث", option1: "m/s", option2ar: "كم", option2: "km", correct: "1",
  };

  it("maps options in order and points correct to the right option", () => {
    const [out] = mapQuestions([row(2, base)], refs);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.options.map((o) => o.id)).toEqual(["o1", "o2"]);
      expect(out.value.correctOptionId).toBe("o1");
      expect(out.value.type).toBe("SINGLE_CHOICE");
      expect(out.value.status).toBe("READY");
    }
  });

  it("rejects a correct index that points to an empty option", () => {
    const [out] = mapQuestions([row(4, { ...base, correct: "3" })], refs);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toContain("correct");
  });

  it("accepts Arabic type and difficulty names", () => {
    const [out] = mapQuestions([row(2, { ...base, type: "صح أو خطأ", difficulty: "صعب", option2ar: "", option2: "" })], refs);
    expect(out.ok).toBe(false); // true/false needs exactly two options, so this row must fail
    const [ok] = mapQuestions([row(2, { ...base, type: "صح أو خطأ", difficulty: "صعب", option2ar: "خطأ", option2: "False" })], refs);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.difficulty).toBe("HARD");
  });
});

describe("exam composition rows", () => {
  it("matches a bank question by Arabic statement and rejects ambiguous matches", () => {
    const bank = new Map<string, { id: string } | "AMBIGUOUS">([
      ["سؤال واحد", { id: "q1" }],
      ["سؤال مكرر", "AMBIGUOUS"],
    ]);
    const outcomes = mapExamQuestions(
      [row(2, { questionstatementar: "سؤال واحد", points: "2" }), row(3, { questionstatementar: "سؤال مكرر", points: "1" }), row(4, { questionstatementar: "غير موجود", points: "1" })],
      bank,
    );
    expect(outcomes[0]).toMatchObject({ ok: true, value: { questionId: "q1", points: 2 } });
    expect(outcomes[1].ok).toBe(false);
    expect(outcomes[2].ok).toBe(false);
  });
});

describe("wrong file for the import", () => {
  const rowsWith = (headers: string[]): ImportRow[] => [{ line: 2, values: Object.fromEntries(headers.map((h) => [h, "x"])) }];

  it("names the required columns a chapters file lacks for a questions import", () => {
    const chaptersFile = rowsWith(["subjectslug", "titlear", "title", "order", "isactive"]);
    expect(missingColumns("questions", chaptersFile)).toEqual(["chapterTitleAr", "lessonTitleAr", "statementAr", "option1Ar", "option2Ar", "correct"]);
  });

  it("accepts a file that has every required column", () => {
    expect(missingColumns("chapters", rowsWith(["subjectslug", "titlear"]))).toEqual([]);
    expect(missingColumns("examQuestions", rowsWith(["questionstatementar", "points"]))).toEqual([]);
  });
});
