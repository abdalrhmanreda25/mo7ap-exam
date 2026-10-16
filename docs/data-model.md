# Data model and security matrix

Source of truth: `src/types/firestore.ts` (shapes), `firestore.rules` (access),
`firestore.indexes.json` (queries), `src/lib/validation/*` (input rules),
`src/lib/domain/*` (IDs and state machines). Tests: `tests/rules`, `tests/unit`.

## Collections

| Path | Purpose | Written by |
| --- | --- | --- |
| `users/{uid}` | Profile: role mirror, `isActive` | Admin SDK only (`provisionUser`, `setUserActive`) |
| `subjects/{id}` | Curriculum subject, configurable tracks and year | Admin client (validated by rules) |
| `chapters/{id}` | Chapter under a subject | Admin client |
| `lessons/{id}` | Lesson under chapter and subject | Admin client |
| `questions/{id}` | Reusable bank item, no correct answer | Admin client |
| `questionOptions/{id}` | Option text for a bank question, no correctness flag | Admin client |
| `questionAnswerKeys/{questionId}` | Correct option for a bank question | Admin client (admin-read only) |
| `exams/{id}` | Exam config and status | Admin client while DRAFT; status changes by server |
| `exams/{id}/questions/{examQuestionId}` | Exam question set and frozen snapshots | Admin client while parent DRAFT; publish (server) |
| `examAnswerKeys/{examId}/items/{examQuestionId}` | Published answer keys | Server only |
| `attempts/{attemptId}` | One attempt per student per exam | Server only |
| `attempts/{attemptId}/answers/{examQuestionId}` | Student's saved selection | Server only |
| `results/{resultId}` | Immutable result record | Server only |
| `auditLogs/{logId}` | Append-only admin and security log | Server only |

## Decisions the schema encodes

- **Deterministic IDs.** `attemptId = "{examId}__{studentId}"`. The ID itself enforces one
  attempt per student per exam; a transactional create fails on the second try. `resultId = attemptId`
  so retried submits converge on one document. `examQuestionId = questionId`, so a question
  appears at most once per exam.
- **`maxAttempts` is fixed at 1.** Rules and the publish gate both require it.
- **Answer keys live apart from content.** Bank correctness is in `questionAnswerKeys`.
  Published correctness is in `examAnswerKeys`, which has no client access at all.
  The published snapshot (`exams/{id}/questions`) holds no correctness field. Rules reject extra
  top-level fields on snapshot writes.
- **Published exams are frozen.** Only DRAFT exams accept edits to their question set. Publish
  copies the bank content into snapshots, so later bank edits never change an existing exam or
  its grading. To change a published exam, clone it into a new exam (new ID).
- **Archive is a flag, delete is never allowed.** `archived` is only settable on CLOSED exams.
  Subjects, chapters, lessons, and questions archive via `isActive` or `status`. Rules deny every delete.
- **Students never read the question bank.** Students receive question content only through
  the `startExam` function (Phase 4), which can shuffle and strip fields. Direct reads are denied
  so shuffle and early-leak rules are enforced in one place.
- **Review policy is per exam.** `showScoreAfterSubmit` defaults to true;
  `showCorrectAnswersAfterSubmit` and `showExplanationsAfterSubmit` default to false.
  The review stage is enforced by the server response, not by the document.
- **Grading policy.** Objective questions only. A correct answer earns the configured points.
  Wrong or unanswered earns 0. No negative marking. Score is `sum(points of correct answers)`
  and `maxScore = sum(all points)`.
- **Early submission is allowed.** Submit closes the attempt immediately. Expired attempts are
  finalized by a scheduled function and by any access that finds a passed deadline (Phase 4).
- **Submission and grading are separate states.** `IN_PROGRESS -> SUBMITTED -> GRADED`.
  Phase 4 grades in the same transaction as submit, but the states stay distinct so
  asynchronous grading (essays later) can slot in without a schema change.
- **Timestamps.** Writes use server timestamps. Rules check `createdAt` and `updatedAt`
  equal `request.time`, so clients cannot forge them.
- **Curriculum is data.** Academic year, curriculum name, and tracks are strings on the
  subject. Nothing hardcodes a Thanaweya list.

## Security matrix

Legend: R = read, W = write, — = denied. "Own" = `studentId == auth.uid` on the document.

| Collection | Anonymous | Student (active) | Student (inactive) | Admin (active) | Server (Admin SDK) |
| --- | --- | --- | --- | --- | --- |
| users | — | R own | — | R all, no W | RW |
| subjects | — | R if `isActive` | — | RW (no delete) | RW |
| chapters / lessons | — | R if `isActive` | — | RW (no delete) | RW |
| questions / questionOptions | — | — | — | RW (no delete) | RW |
| questionAnswerKeys | — | — | — | RW (validated) | RW |
| exams | — | R if PUBLISHED | — | R all; W DRAFT; archive CLOSED | RW |
| exams/*/questions | — | — | — | R all; W if parent DRAFT | RW |
| examAnswerKeys | — | — | — | — | RW |
| attempts | — | R own (query must filter `studentId`) | — | R all, no W | RW |
| attempts/*/answers | — | R own attempt | — | R all, no W | RW |
| results | — | R own (query must filter `studentId`) | — | R all, no W, no delete | RW |
| auditLogs | — | — | — | R all, no W | W (append) |

"No W" means the client cannot create, update, or delete. "No delete" applies to every role,
including server code that is not supposed to delete either. Phase 4 functions enforce this by
convention and tests.

## What the emulator tests prove

`tests/rules/firestore.rules.test.ts` (51 cases) runs direct client-SDK
requests against the Firestore emulator with the real `firestore.rules`. Covered attacks:
role self-promotion, profile creation or deletion, spoofed ADMIN claim with STUDENT profile,
reading or writing answer keys (bank and published) at every role, cross-student reads of
attempts, answers, and results, direct attempt creation, score or status edits, deadline edits,
answer injection with extra fields, result create or edit or delete, audit log writes and deletes,
deactivated accounts, publishing or editing a published exam from the client, exam snapshot
writes after publish, non-snapshot fields in exam questions, and unfiltered list queries.

## Known limits

- Rules cannot enforce cross-document invariants beyond the `exists` and `get` checks
  listed above. Phase 4 transactions enforce the rest (answer belongs to the exam's question
  set, option belongs to the question, deadline, one submit).
- Rules evaluate per document. List queries must include the constraint the rule relies on.
  The client code (Phase 5) will always add those constraints.
- Admin client writes to curriculum and bank bypass Zod. Rules validate shape and types, and
  Phase 3 server actions add Zod checks before writing.

## Phase 3 write path

All admin writes go through server actions (`src/features/*/actions.ts`). Each action:
1. Checks the session and the `ADMIN` role on every call (`runAdminAction`). Server actions are public POST endpoints, so the page layout check alone is not enough.
2. Validates input with Zod on the server, even though the client validates first.
3. Writes through `src/features/*/service.ts` with the Admin SDK, which bypasses rules. Each mutation also writes an `auditLogs` entry in the same batch or transaction.

Because the app never writes curriculum or bank data from the browser, the admin client rules are a second layer, not the primary check.

**Publish** (`publishExam`) runs as one transaction:
- Reads the composition and live bank state, then runs `readinessIssues`. Any issue aborts with the full list.
- Requires the stored `questionCount` and `maxScore` to match the actual composition.
- Refreshes each exam-question snapshot from the bank, so the published content is what the bank held at publish time.
- Writes answer keys to `examAnswerKeys/{examId}/items` using the same option IDs as `optionsSnapshot`. Those are the IDs students submit.
- Sets `PUBLISHED`. Two concurrent publishes: one wins, the other sees a non-DRAFT status and fails.

**Bank locking**: `updateQuestion` checks every exam that holds the question. If any is not a draft, content fields (type, statement, explanation, options, correct answer) must match stored values. Metadata (difficulty, lesson, status) stays editable. The check compares stored content to incoming content, not input to itself.

**Option IDs**: client option IDs are scoped in Firestore as `{questionId}__{optionId}` so they stay unique across questions. Snapshots and keys store the client ID.

**Closing** blocks new starts only. Existing attempts and keys are untouched. **Archiving** is allowed only on closed exams and hides them from the default list.

**Routes**: `/admin/chapters` and `/admin/lessons` redirect to `/admin/subjects`. Chapters and lessons are always managed under a known subject, so a standalone list would add nothing.

## Phase 3 known limits

- Option removal deletes option documents through the Admin SDK. Clients cannot delete them. Only unlocked questions can change their option set.
- Math notation is stored and displayed as text (for example `x²`), not rendered as LaTeX.
- Media is a list of URLs. There is no upload path, so Firebase Storage is not used yet.
- Bank filtering and the addable-question picker sort and filter in memory. This is fine at the expected scale, but it should move to indexed queries if the bank grows past a few thousand questions.
- Changing a subject after creation is refused for both exams and questions, to keep composition consistent.
