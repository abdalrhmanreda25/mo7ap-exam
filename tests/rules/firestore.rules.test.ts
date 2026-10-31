import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";

/**
 * Direct client-SDK attacks against firestore.rules, run on the Firestore emulator.
 * Browsers may touch camera signaling only. Everything else is server-only, so every
 * client read or write of it must fail, for every role. Camera sessions are scoped to
 * one teacher space: the teacher of another space can neither watch nor answer.
 */

const RULES = readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
const [FS_HOST, FS_PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8181").split(":");

const WS = "ws-a";
const OTHER_WS = "ws-b";
const ADMIN = "admin1"; // teacher of WS
const OTHER_ADMIN = "adminB"; // teacher of OTHER_WS
const STUDENT = "stu1"; // student of WS
const OTHER_STUDENT = "stu2"; // another student of WS
const INACTIVE_STUDENT = "stuOff";
const SPOOFED_ADMIN = "fakeAdmin"; // token claims ADMIN, profile says STUDENT
const ANON = null;

let env: RulesTestEnvironment;

const ts = () => Timestamp.now();
const offer = { type: "offer", sdp: "v=0" };
const answer = { type: "answer", sdp: "v=0" };

function asUser(uid: string | null, role?: "ADMIN" | "STUDENT") {
  if (uid === null) return env.unauthenticatedContext().firestore();
  return env.authenticatedContext(uid, role ? { role } : {}).firestore();
}

/** Server-only paths: one existing document in each. */
const SERVER_ONLY: string[][] = [
  ["users", STUDENT],
  ["workspaces", WS],
  ["subjects", "s1"],
  ["chapters", "c1"],
  ["lessons", "l1"],
  ["questions", "q1"],
  ["questionOptions", "q1__a"],
  ["questionAnswerKeys", "q1"],
  ["questionMedia", "m1"],
  ["exams", "e1"],
  ["exams", "e1", "questions", "q1"],
  ["examAnswerKeys", "e1", "items", "q1"],
  ["examAccessCodes", "e1"],
  ["attempts", "e1__stu1"],
  ["attempts", "e1__stu1", "answers", "q1"],
  ["results", "e1__stu1"],
  ["auditLogs", "log1"],
  ["system", "migrations"],
];

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = ts();
    const profile = (uid: string, role: string, isActive: boolean, workspaceId: string) =>
      setDoc(doc(db, "users", uid), { uid, displayName: uid, email: null, role, isActive, workspaceId, createdAt: now, updatedAt: now });
    await profile(ADMIN, "ADMIN", true, WS);
    await profile(OTHER_ADMIN, "ADMIN", true, OTHER_WS);
    await profile(STUDENT, "STUDENT", true, WS);
    await profile(OTHER_STUDENT, "STUDENT", true, WS);
    await profile(INACTIVE_STUDENT, "STUDENT", false, WS);
    await profile(SPOOFED_ADMIN, "STUDENT", true, WS);

    for (const [col, ...rest] of SERVER_ONLY) {
      if (col === "users") continue;
      await setDoc(doc(db, col, ...rest), { workspaceId: WS, studentId: STUDENT, seeded: true });
    }

    await setDoc(doc(db, "monitorSessions", "e1__stu1"), {
      studentId: STUDENT, workspaceId: WS, offer, offerFor: null, answer: null, status: "live", updatedAt: now,
    });
    await setDoc(doc(db, "monitorSessions", "e1__stu1", "studentCandidates", "c1"), { candidate: "x", viewerId: "v1" });
    await setDoc(doc(db, "monitorSessions", "e1__stu1", "adminCandidates", "c1"), { candidate: "y", viewerId: "v1" });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-mo7ap-exam-rules",
    firestore: { host: FS_HOST, port: Number(FS_PORT), rules: RULES },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

describe("server-only data: no client access for any role", () => {
  const callers: [string, string | null, "ADMIN" | "STUDENT" | undefined][] = [
    ["unauthenticated", ANON, undefined],
    ["teacher of the same space", ADMIN, "ADMIN"],
    ["teacher of another space", OTHER_ADMIN, "ADMIN"],
    ["the owning student", STUDENT, "STUDENT"],
    ["a spoofed admin claim", SPOOFED_ADMIN, "ADMIN"],
  ];

  for (const [label, uid, role] of callers) {
    it(`${label} cannot read, write, or delete any of it`, async () => {
      const db = asUser(uid, role);
      for (const [col, ...rest] of SERVER_ONLY) {
        const ref = doc(db, col, ...rest);
        await assertFails(getDoc(ref));
        await assertFails(setDoc(ref, { workspaceId: WS, hacked: true }));
        await assertFails(deleteDoc(ref));
      }
    });
  }

  it("no role can list subjects, exams, students, results, attempts, or questions", async () => {
    for (const [uid, role] of [[ADMIN, "ADMIN"], [OTHER_ADMIN, "ADMIN"], [STUDENT, "STUDENT"]] as const) {
      const db = asUser(uid, role);
      for (const col of ["subjects", "exams", "users", "results", "attempts", "questions"]) {
        await assertFails(getDocs(collection(db, col)));
      }
    }
  });
});

describe("camera signaling (monitorSessions), scoped to a teacher space", () => {
  it("the student creates a live session for their own attempt in their own space only", async () => {
    const db = asUser(STUDENT, "STUDENT");
    const body = { studentId: STUDENT, workspaceId: WS, offer, offerFor: null, answer: null, status: "live", updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db, "monitorSessions", "e2__stu1"), body));
    await assertFails(setDoc(doc(db, "monitorSessions", "e3__stu1"), { ...body, workspaceId: OTHER_WS }));
    await assertFails(setDoc(doc(db, "monitorSessions", "e4__stu2"), { ...body, studentId: OTHER_STUDENT }));
    await assertFails(setDoc(doc(db, "monitorSessions", "e5__stu1"), { ...body, answer }));
  });

  it("the teacher of the same space reads and answers; another space's teacher cannot", async () => {
    const same = asUser(ADMIN, "ADMIN");
    const other = asUser(OTHER_ADMIN, "ADMIN");
    await assertSucceeds(getDoc(doc(same, "monitorSessions", "e1__stu1")));
    await assertSucceeds(updateDoc(doc(same, "monitorSessions", "e1__stu1"), { answer, updatedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(other, "monitorSessions", "e1__stu1")));
    await assertFails(
      updateDoc(doc(other, "monitorSessions", "e1__stu1"), { request: { viewerId: "spy", at: serverTimestamp() }, updatedAt: serverTimestamp() }),
    );
  });

  it("only the same space's teacher sees and adds ICE candidates", async () => {
    const same = asUser(ADMIN, "ADMIN");
    const other = asUser(OTHER_ADMIN, "ADMIN");
    await assertSucceeds(getDocs(collection(same, "monitorSessions", "e1__stu1", "studentCandidates")));
    await assertSucceeds(addDoc(collection(same, "monitorSessions", "e1__stu1", "adminCandidates"), { candidate: "z", viewerId: "v2" }));
    await assertFails(getDocs(collection(other, "monitorSessions", "e1__stu1", "studentCandidates")));
    await assertFails(addDoc(collection(other, "monitorSessions", "e1__stu1", "adminCandidates"), { candidate: "z", viewerId: "spy" }));
  });

  it("the student reads their own session and candidates; other students cannot", async () => {
    await assertSucceeds(getDoc(doc(asUser(STUDENT, "STUDENT"), "monitorSessions", "e1__stu1")));
    await assertSucceeds(getDocs(collection(asUser(STUDENT, "STUDENT"), "monitorSessions", "e1__stu1", "adminCandidates")));
    await assertFails(getDoc(doc(asUser(OTHER_STUDENT, "STUDENT"), "monitorSessions", "e1__stu1")));
    await assertFails(addDoc(collection(asUser(OTHER_STUDENT, "STUDENT"), "monitorSessions", "e1__stu1", "studentCandidates"), { candidate: "x" }));
  });

  it("the student cannot forge an answer or a viewer request, and the teacher cannot rewrite the offer", async () => {
    await assertFails(updateDoc(doc(asUser(STUDENT, "STUDENT"), "monitorSessions", "e1__stu1"), { answer, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asUser(STUDENT, "STUDENT"), "monitorSessions", "e1__stu1"), { request: { viewerId: "self" }, updatedAt: serverTimestamp() }));
    await assertFails(
      updateDoc(doc(asUser(ADMIN, "ADMIN"), "monitorSessions", "e1__stu1"), { offer: { type: "offer", sdp: "forged" }, updatedAt: serverTimestamp() }),
    );
  });

  it("a returning viewer asks for a fresh offer, and the student's merge write keeps the request", async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(ADMIN, "ADMIN"), "monitorSessions", "e1__stu1"), { request: { viewerId: "v2", at: serverTimestamp() }, updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(
      setDoc(
        doc(asUser(STUDENT, "STUDENT"), "monitorSessions", "e1__stu1"),
        { studentId: STUDENT, workspaceId: WS, offer, offerFor: "v2", answer: null, status: "live", updatedAt: serverTimestamp() },
        { merge: true },
      ),
    );
  });

  it("leaving marks the session ended, even after the teacher answered", async () => {
    await assertSucceeds(updateDoc(doc(asUser(ADMIN, "ADMIN"), "monitorSessions", "e1__stu1"), { answer, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(asUser(STUDENT, "STUDENT"), "monitorSessions", "e1__stu1"), { status: "ended", updatedAt: serverTimestamp() }));
  });

  it("a session saved before spaces existed gets its space on the student's next write", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "monitorSessions", "legacy__stu1"), { studentId: STUDENT, offer, answer: null, status: "live", updatedAt: ts() });
    });
    await assertSucceeds(
      setDoc(
        doc(asUser(STUDENT, "STUDENT"), "monitorSessions", "legacy__stu1"),
        { studentId: STUDENT, workspaceId: WS, offer, offerFor: null, answer: null, status: "live", updatedAt: serverTimestamp() },
        { merge: true },
      ),
    );
  });

  it("nobody deletes a session, inactive students get nothing, and pre-reading a missing session is denied", async () => {
    await assertFails(deleteDoc(doc(asUser(ADMIN, "ADMIN"), "monitorSessions", "e1__stu1")));
    await assertFails(deleteDoc(doc(asUser(STUDENT, "STUDENT"), "monitorSessions", "e1__stu1")));
    await assertFails(getDoc(doc(asUser(INACTIVE_STUDENT, "STUDENT"), "monitorSessions", "e1__stu1")));
    await assertFails(getDoc(doc(asUser(STUDENT, "STUDENT"), "monitorSessions", "not-yet")));
    await assertFails(getDoc(doc(asUser(ANON), "monitorSessions", "e1__stu1")));
  });
});
