/**
 * Firestore document shapes. Source of truth for the TypeScript side.
 * firestore.rules mirrors the same field names and enums. Keep both in sync.
 */

/** Anything with toDate(): both client and admin Timestamp satisfy this. */
export interface TimestampLike {
  toDate(): Date;
}

export const COLLECTIONS = {
  users: "users",
  subjects: "subjects",
  chapters: "chapters",
  lessons: "lessons",
  questions: "questions",
  questionOptions: "questionOptions",
  questionAnswerKeys: "questionAnswerKeys",
  exams: "exams",
  examQuestions: "questions", // subcollection: exams/{examId}/questions
  examAnswerKeys: "examAnswerKeys", // examAnswerKeys/{examId}/items
  examAccessCodes: "examAccessCodes", // examAccessCodes/{examId}, server only
  attempts: "attempts",
  attemptAnswers: "answers", // subcollection: attempts/{attemptId}/answers
  results: "results",
  auditLogs: "auditLogs",
} as const;

export const ROLE_VALUES = ["ADMIN", "STUDENT"] as const;
export const QUESTION_TYPES = ["SINGLE_CHOICE", "TRUE_FALSE"] as const;
export const QUESTION_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export const QUESTION_STATUSES = ["DRAFT", "READY", "ARCHIVED"] as const;
export const EXAM_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"] as const;
export const ATTEMPT_STATUSES = ["IN_PROGRESS", "SUBMITTED", "GRADED"] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
export type ExamStatus = (typeof EXAM_STATUSES)[number];
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];
export type Role = (typeof ROLE_VALUES)[number];

export interface UserDoc {
  uid: string;
  displayName: string;
  email: string | null;
  role: Role;
  isActive: boolean;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface SubjectDoc {
  name: string;
  nameAr: string;
  slug: string;
  description: string;
  academicYear: string;
  curriculum: string;
  applicableTracks: string[];
  order: number;
  isActive: boolean;
  createdBy: string;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface ChapterDoc {
  subjectId: string;
  title: string;
  titleAr: string;
  description: string;
  order: number;
  isActive: boolean;
  createdBy: string;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface LessonDoc {
  subjectId: string;
  chapterId: string;
  title: string;
  titleAr: string;
  order: number;
  isActive: boolean;
  createdBy: string;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

/** Reusable bank item. Carries no correct-answer information. */
export interface QuestionDoc {
  subjectId: string;
  chapterId: string;
  lessonId: string;
  type: QuestionType;
  statement: string;
  statementAr: string;
  mediaReferences: string[];
  difficulty: QuestionDifficulty;
  explanation: string;
  explanationAr: string;
  status: QuestionStatus;
  createdBy: string;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface QuestionOptionDoc {
  questionId: string;
  text: string;
  textAr: string;
  order: number;
}

/** Admin-only. Separate from the bank item so the key never rides along with content. */
export interface QuestionAnswerKeyDoc {
  correctOptionId: string;
  updatedBy: string;
  updatedAt: TimestampLike;
}

export interface ExamDoc {
  title: string;
  titleAr: string;
  description: string;
  subjectId: string;
  chapterIds: string[];
  lessonIds: string[];
  academicYear: string;
  durationSeconds: number;
  maxAttempts: 1;
  status: ExamStatus;
  archived: boolean;
  questionCount: number;
  maxScore: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showScoreAfterSubmit: boolean;
  showCorrectAnswersAfterSubmit: boolean;
  showExplanationsAfterSubmit: boolean;
  publishedAt: TimestampLike | null;
  createdBy: string;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
  version: number;
}

export interface OptionSnapshot {
  optionId: string;
  text: string;
  textAr: string;
  order: number;
}

export interface QuestionSnapshot {
  type: QuestionType;
  statement: string;
  statementAr: string;
  explanation: string;
  explanationAr: string;
  difficulty: QuestionDifficulty;
  mediaReferences: string[];
}

/** exams/{examId}/questions/{examQuestionId}. examQuestionId === questionId. Never holds a key. */
export interface ExamQuestionDoc {
  questionId: string;
  order: number;
  points: number;
  questionSnapshot: QuestionSnapshot;
  optionsSnapshot: OptionSnapshot[];
  questionVersion: number;
}

/** examAnswerKeys/{examId}/items/{examQuestionId}. Server-only. */
export interface ExamAnswerKeyDoc {
  correctOptionId: string;
  points: number;
  gradingVersion: number;
}

export interface AttemptDoc {
  examId: string;
  studentId: string;
  subjectId: string;
  status: AttemptStatus;
  startedAt: TimestampLike;
  deadlineAt: TimestampLike;
  submittedAt: TimestampLike | null;
  score: number | null;
  maxScore: number;
  examVersion: number;
  gradingVersion: number;
  lastSavedAt: TimestampLike | null;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

/** attempts/{attemptId}/answers/{examQuestionId}. Student writes nothing directly. */
export interface AttemptAnswerDoc {
  examQuestionId: string;
  selectedOptionId: string;
  savedAt: TimestampLike;
}

/** results/{resultId}. resultId === attemptId. Immutable for students. */
export interface ResultDoc {
  studentId: string;
  examId: string;
  subjectId: string;
  attemptId: string;
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: TimestampLike;
  gradingVersion: number;
  createdAt: TimestampLike;
}

export interface AuditLogDoc {
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  timestamp: TimestampLike;
  reason: string | null;
  metadata: Record<string, unknown>;
}
