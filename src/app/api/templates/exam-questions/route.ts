import { connection } from "next/server";
import ExcelJS from "exceljs";
import { getSessionUser } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { getExam } from "@/features/exams/service";
import { COLLECTIONS } from "@/types/firestore";

const ROWS = 500;

/**
 * Excel template for exam composition. Column A is a dropdown limited to READY bank questions
 * for the exam's subject, so rows can only point at existing questions. Column B takes points 1-100.
 */
export async function GET(request: Request) {
  await connection();
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return new Response("Forbidden", { status: 403 });

  const examId = new URL(request.url).searchParams.get("examId") ?? "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(examId)) return new Response("Bad examId", { status: 400 });

  const db = getAdminDb();
  const exam = await getExam(db, examId);
  if (!exam) return new Response("Not found", { status: 404 });

  const bank = await db
    .collection(COLLECTIONS.questions)
    .where("subjectId", "==", exam.subjectId)
    .where("status", "==", "READY")
    .get();
  const statements = [...new Set(bank.docs.map((d) => String(d.data().statementAr ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ar"),
  );
  if (statements.length === 0) return new Response("No READY questions for this subject", { status: 409 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("exam-questions");
  sheet.columns = [
    { header: "questionStatementAr", key: "questionStatementAr", width: 60 },
    { header: "points", key: "points", width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };

  const source = workbook.addWorksheet("bank", { state: "hidden" });
  statements.forEach((text, i) => {
    source.getCell(i + 1, 1).value = text;
  });
  const listRef = `bank!$A$1:$A$${statements.length}`;

  for (let r = 2; r <= ROWS + 1; r++) {
    sheet.getCell(`A${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "سؤال غير موجود",
      error: "اختر سؤالًا من القائمة. الأسئلة تُضاف من بنك الأسئلة فقط.",
      formulae: [listRef],
    };
    sheet.getCell(`B${r}`).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "درجة غير صالحة",
      error: "أدخل رقمًا صحيحًا بين 1 و 100.",
      formulae: [1, 100],
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="exam-${examId}-questions.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
