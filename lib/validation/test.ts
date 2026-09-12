import { z } from "zod";

// ── Test Settings ────────────────────────────────────────────────────────────

export const testSettingsSchema = z.object({
  cameraRequired: z.boolean().default(true),
  fullscreenRequired: z.boolean().default(true),
  tabSwitchDetection: z.boolean().default(true),
  warningLimit: z.number().int().min(1).max(10).default(3),
  autoSubmitOnExpiry: z.boolean().default(true),
  showResultImmediately: z.boolean().default(true),
  showCorrectAnswers: z.boolean().default(false),
  randomizeQuestions: z.boolean().default(false),
  randomizeOptions: z.boolean().default(false),
});

export type TestSettings = z.infer<typeof testSettingsSchema>;

// ── Create / Update Test ─────────────────────────────────────────────────────

export const createTestSchema = z.object({
  title: z.string().min(1, "Title is required.").max(200),
  subject: z.string().min(1, "Subject is required.").max(100),
  className: z.string().min(1, "Class is required.").max(100),
  description: z.string().max(1000).optional(),
  durationSeconds: z
    .number()
    .int()
    .min(60, "Duration must be at least 1 minute.")
    .max(3 * 60 * 60, "Duration cannot exceed 3 hours."),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
  maxAttempts: z.number().int().min(1).max(10).default(1),
  settings: testSettingsSchema,
});

export const updateTestSchema = createTestSchema.partial();

export type CreateTestInput = z.infer<typeof createTestSchema>;
export type UpdateTestInput = z.infer<typeof updateTestSchema>;

// ── Question ─────────────────────────────────────────────────────────────────

export const baseQuestionSchema = z.object({
  type: z.enum(["MCQ", "TRUE_FALSE", "NUMERICAL", "SHORT_ANSWER"]),
  questionText: z.string().min(1, "Question text is required.").max(5000),
  options: z
    .array(z.string().min(1).max(500))
    .min(2, "MCQ requires at least 2 options.")
    .max(6, "MCQ allows at most 6 options.")
    .optional(),
  correctAnswer: z.string().min(1, "Correct answer is required.").max(500),
  marks: z.number().min(0.5).max(100).default(1),
  negativeMarks: z.number().min(0).max(100).default(0),
  explanation: z.string().max(2000).optional(),
});

export const createQuestionSchema = baseQuestionSchema.superRefine((data, ctx) => {
  // Validate that negativeMarks does not exceed marks
  if (data.negativeMarks > data.marks) {
    ctx.addIssue({
      code: "custom",
      path: ["negativeMarks"],
      message: "Negative marks cannot exceed the positive marks for this question.",
    });
  }

  if (data.type === "MCQ") {
    if (!data.options || data.options.length < 2) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "MCQ requires at least 2 options." });
    }
    const idx = parseInt(data.correctAnswer, 10);
    if (isNaN(idx) || idx < 0 || idx >= (data.options?.length ?? 0)) {
      ctx.addIssue({ code: "custom", path: ["correctAnswer"], message: "Correct answer must be a valid option index." });
    }
  }
  if (data.type === "TRUE_FALSE") {
    if (!["true", "false"].includes(data.correctAnswer.toLowerCase())) {
      ctx.addIssue({ code: "custom", path: ["correctAnswer"], message: 'Correct answer must be "true" or "false".' });
    }
  }
  if (data.type === "NUMERICAL") {
    if (isNaN(parseFloat(data.correctAnswer))) {
      ctx.addIssue({ code: "custom", path: ["correctAnswer"], message: "Correct answer must be a valid number." });
    }
  }
});

export const updateQuestionSchema = baseQuestionSchema.partial();
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

// ── Student Answer ────────────────────────────────────────────────────────────

export const studentAnswerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().max(2000).nullable(),
});
export type StudentAnswerInput = z.infer<typeof studentAnswerSchema>;

// ── Student Identity ──────────────────────────────────────────────────────────

export const studentIdentitySchema = z.object({
  studentName: z.string().min(2, "Name must be at least 2 characters.").max(100),
  rollNumber: z.string().min(1, "Roll number is required.").max(30),
});
export type StudentIdentityInput = z.infer<typeof studentIdentitySchema>;

// ── Proctoring Event ──────────────────────────────────────────────────────────

export const proctoringEventSchema = z.object({
  eventType: z.enum([
    "TAB_SWITCH", "FULLSCREEN_EXIT", "CAMERA_DISCONNECTED", "CAMERA_RECONNECTED",
    "PERSON_MISSING", "MULTIPLE_PEOPLE", "PHONE_DETECTED", "FACE_NOT_VISIBLE",
    "SUSPICIOUS_OBJECT", "COPY_PASTE_DETECTED", "PRINT_ATTEMPTED", "OTHER",
  ]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  description: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type ProctoringEventInput = z.infer<typeof proctoringEventSchema>;

// ── Question Reorder ──────────────────────────────────────────────────────────

export const reorderQuestionsSchema = z.object({
  order: z.array(z.object({ id: z.string().min(1), order: z.number().int().min(1) })).min(1),
});
export type ReorderQuestionsInput = z.infer<typeof reorderQuestionsSchema>;
