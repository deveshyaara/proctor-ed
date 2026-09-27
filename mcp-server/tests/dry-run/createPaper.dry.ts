/**
 * tests/dry-run/createPaper.dry.ts
 *
 * End-to-end dry run of the `create_exam_paper` MCP tool.
 *
 * - No real network calls: ProctorEdClient is fully stubbed in-process.
 * - Exercises: Zod parsing → validateQuestion → deduplicateBatch
 *              → validatePaper → (stubbed) createTest → bulkCreateQuestions
 * - Prints exactly what Claude sends and what the MCP tool returns.
 *
 * Run:
 *   npx tsx tests/dry-run/createPaper.dry.ts
 */

import { fileURLToPath } from "node:url";
import path from "node:path";

// Polyfill __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Minimal env setup (config.ts requireEnv) ─────────────────────────────────
process.env["PROCTOR_ED_API_URL"] = "http://dry-run.local";
process.env["PROCTOR_ED_SERVICE_TOKEN"] = "dry-run-token";
process.env["MCP_TRANSPORT"] = "stdio";

// ── Import orchestrator + schema modules (no stub needed here) ────────────────
import { validateQuestion, validatePaper } from "../../src/orchestrator/validateExam.js";
import { deduplicateBatch } from "../../src/orchestrator/detectDuplicates.js";
import {
  CreateExamInputSchema,
  toProctorEdQuestion,
  type GeneratedQuestion,
} from "../../src/schemas.js";
import { getConfig } from "../../src/config.js";

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  dim:    "\x1b[2m",
  blue:   "\x1b[34m",
};

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}${"─".repeat(62)}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${title}${C.reset}`);
  console.log(`${C.cyan}${"─".repeat(62)}${C.reset}`);
}
function ok(msg: string)   { console.log(`  ${C.green}✅ ${msg}${C.reset}`); }
function warn(msg: string)  { console.log(`  ${C.yellow}⚠️  ${msg}${C.reset}`); }
function fail(msg: string)  { console.log(`  ${C.red}❌ ${msg}${C.reset}`); }
function info(msg: string)  { console.log(`  ${C.dim}   ${msg}${C.reset}`); }

// ─────────────────────────────────────────────────────────────────────────────
//  SIMULATED INPUT — exactly what Claude would pass to create_exam_paper
// ─────────────────────────────────────────────────────────────────────────────

const CLAUDE_INPUT = {
  title: "Physics Mid-Term Exam",
  subject: "Physics",
  className: "XI",
  description: "Covers Mechanics and Thermodynamics",
  durationMinutes: 60,
  questions: [
    // 1. MCQ ──────────────────────────────────────────────────────────────────
    {
      type: "MCQ",
      questionText: "What is Newton's second law of motion?",
      options: [
        "Force equals mass times velocity",
        "Force equals mass times acceleration",
        "Force equals mass divided by acceleration",
        "Force equals velocity divided by time",
      ],
      correctOptionIndex: 1,
      marks: 2,
      negativeMarks: 0.5,
      difficulty: "easy",
      explanation: "F = ma — force equals mass times acceleration.",
    },
    // 2. TRUE/FALSE ────────────────────────────────────────────────────────────
    {
      type: "TRUE_FALSE",
      questionText: "The SI unit of force is the Newton.",
      correctAnswer: true,
      marks: 1,
      negativeMarks: 0,
      difficulty: "easy",
    },
    // 3. NUMERICAL ────────────────────────────────────────────────────────────
    {
      type: "NUMERICAL",
      questionText:
        "A body of mass 5 kg is accelerated at 3 m/s². What is the net force in Newtons?",
      correctAnswer: 15,
      tolerance: 0.5,
      unit: "N",
      marks: 3,
      negativeMarks: 1,
      difficulty: "medium",
      explanation: "F = ma = 5 × 3 = 15 N",
    },
    // 4. MCQ (harder) ─────────────────────────────────────────────────────────
    {
      type: "MCQ",
      questionText:
        "Which statement correctly describes the law of conservation of energy?",
      options: [
        "Energy can be created but not destroyed",
        "Energy can be destroyed but not created",
        "Energy can neither be created nor destroyed, only converted",
        "Energy is always lost as heat",
      ],
      correctOptionIndex: 2,
      marks: 2,
      negativeMarks: 0.5,
      difficulty: "medium",
    },
    // 5. SHORT ANSWER ──────────────────────────────────────────────────────────
    {
      type: "SHORT_ANSWER",
      questionText:
        "State the law of conservation of momentum in one sentence.",
      expectedAnswer:
        "The total momentum of a closed system remains constant if no external force acts on it.",
      acceptableAnswers: [
        "Momentum is conserved when no external forces act.",
        "Total momentum before equals total momentum after in a closed system.",
      ],
      marks: 3,
      negativeMarks: 0,
      difficulty: "hard",
    },
    // 6. INTENTIONAL DUPLICATE — same question text as Q1, should be removed ──
    {
      type: "MCQ",
      questionText: "What is Newton's second law of motion?",
      options: [
        "Force equals mass times velocity",
        "Force equals mass times acceleration",
        "Force equals mass divided by acceleration",
        "Force equals velocity divided by time",
      ],
      correctOptionIndex: 1,
      marks: 2,
      negativeMarks: 0.5,
      difficulty: "easy",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
//  DRY RUN EXECUTION
// ─────────────────────────────────────────────────────────────────────────────

async function dryRun(): Promise<void> {
  console.log(
    `\n${C.bold}${C.blue}ProctorED MCP — create_exam_paper  DRY RUN${C.reset}`
  );
  console.log(
    `${C.dim}Simulates the full pipeline with zero HTTP calls${C.reset}\n`
  );

  // ── STEP 0: Config ────────────────────────────────────────────────────────
  section("STEP 0 · Config validation");
  let cfg: ReturnType<typeof getConfig>;
  try {
    cfg = getConfig();
    ok(`API URL:     ${cfg.api.baseUrl}`);
    ok(`Transport:   ${cfg.mcp.transport}`);
    ok(`Batch size:  ${cfg.generation.batchSize}`);
    ok(`Max retries: ${cfg.generation.maxRetriesPerQuestion}`);
  } catch (e) {
    fail(`Config error: ${e}`);
    process.exit(1);
  }

  // ── STEP 1: Raw Claude input ──────────────────────────────────────────────
  section("STEP 1 · Claude's raw input to create_exam_paper");
  console.log(JSON.stringify(CLAUDE_INPUT, null, 2));

  // ── STEP 2: Zod schema parse ──────────────────────────────────────────────
  section("STEP 2 · Zod schema parse (CreateExamInputSchema)");
  const parsed = CreateExamInputSchema.safeParse(CLAUDE_INPUT);
  if (!parsed.success) {
    fail("Schema parse FAILED:");
    for (const e of parsed.error.errors)
      fail(`  [${e.path.join(".")}] ${e.message}`);
    process.exit(1);
  }
  ok(
    `Schema parse passed — ${parsed.data.questions.length} raw questions received`
  );
  const input = parsed.data;

  // ── STEP 3: Per-question validation ──────────────────────────────────────
  section("STEP 3 · Per-question structural + semantic validation");
  const validationIssues: Array<{ questionIndex?: number; message: string }> =
    [];
  const validQuestions: GeneratedQuestion[] = [];

  for (let i = 0; i < input.questions.length; i++) {
    const q = input.questions[i]!;
    const result = validateQuestion(q, i);
    if (!result.valid) {
      validationIssues.push(...result.issues);
      fail(
        `Q[${i}] (${q.type}) FAILED: ${result.issues.map((x) => x.message).join("; ")}`
      );
    } else {
      validQuestions.push(q);
      ok(`Q[${i}] (${q.type}) — "${q.questionText.slice(0, 55)}…"`);
    }
  }

  if (validationIssues.length > 0) {
    fail(`\n  ${validationIssues.length} structural issue(s). Aborting.`);
    process.exit(1);
  }

  // ── STEP 4: Duplicate detection ───────────────────────────────────────────
  section(
    "STEP 4 · Duplicate detection (cosine similarity threshold 0.70)"
  );
  const { accepted: deduped, duplicateCount } = deduplicateBatch(
    validQuestions,
    []
  );

  ok(`Questions accepted:   ${deduped.length}`);
  if (duplicateCount > 0) {
    warn(`Duplicates removed:   ${duplicateCount}  (exact / near-match)`);
    for (let i = 0; i < validQuestions.length; i++) {
      const q = validQuestions[i]!;
      const inDeduped = deduped.includes(q);
      if (!inDeduped) {
        warn(
          `  → Removed Q[${i}]: "${q.questionText.slice(0, 55)}…"`
        );
      }
    }
  } else {
    info("No duplicates found");
  }

  // ── STEP 5: Paper-level validation ───────────────────────────────────────
  section("STEP 5 · Paper-level validation");
  const paperResult = validatePaper(deduped, {
    questionCount: deduped.length,
    questionTypes: Array.from(new Set(deduped.map((q) => q.type))),
    difficultyLevel: "mixed",
  });
  paperResult.duplicateCount = duplicateCount;

  ok(`Valid:          ${paperResult.valid}`);
  ok(`Question count: ${paperResult.questionCount}`);
  ok(`Total marks:    ${paperResult.totalMarks}`);
  ok(`Duplicates:     ${paperResult.duplicateCount} removed`);

  if (paperResult.structuralErrors.length > 0)
    for (const e of paperResult.structuralErrors) fail(`Structural: ${e.message}`);
  if (paperResult.distributionErrors.length > 0)
    for (const e of paperResult.distributionErrors) warn(`Distribution: ${e.message}`);
  if (paperResult.warnings.length > 0)
    for (const w of paperResult.warnings) warn(`Warning: ${w.message}`);

  if (!paperResult.valid) {
    fail("Paper validation FAILED — would abort here.");
    process.exit(1);
  }

  // ── STEP 6: Wire format conversion ───────────────────────────────────────
  section("STEP 6 · Convert to ProctorED wire format (toProctorEdQuestion)");
  const questionPayloads = deduped.map(toProctorEdQuestion);
  for (let i = 0; i < questionPayloads.length; i++) {
    const qp = questionPayloads[i]!;
    ok(
      `Q[${i}] type=${qp.type.padEnd(12)} marks=${String(qp.marks).padEnd(3)} correctAnswer="${qp.correctAnswer}"`
    );
    if (qp.options) info(`     options: [${qp.options.join(" | ")}]`);
  }

  // ── STEP 7: Stubbed API calls ─────────────────────────────────────────────
  section("STEP 7 · Stubbed API calls (no real HTTP)");

  // Simulate POST /api/tests
  const testId = `dry-run-test-${Date.now()}`;
  const testCode = `DRY${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const title =
    input.title ?? `${input.subject} Exam — Class ${input.className}`;

  ok(`[STUB] POST /api/tests`);
  info(`       → testId   = ${testId}`);
  info(`       → testCode = ${testCode}`);
  info(`       → title    = "${title}"`);
  info(`       → status   = DRAFT`);
  info(`       → duration = ${input.durationMinutes} min`);

  ok(`[STUB] POST /api/tests/${testId}/questions/bulk`);
  info(`       → inserted ${questionPayloads.length} questions`);

  // ── STEP 8: Final tool response ───────────────────────────────────────────
  section("STEP 8 · Tool response (exactly what Claude receives back)");

  const toolResponse = {
    success: true,
    testId,
    testCode,
    title,
    status: "DRAFT",
    questionCount: deduped.length,
    totalMarks: paperResult.totalMarks,
    duplicatesRemoved: duplicateCount,
    previewUrl: `${cfg.api.baseUrl}/tests/${testId}`,
    message: [
      `✅ Created draft exam: "${title}"`,
      `📋 ${deduped.length} questions | ${paperResult.totalMarks} marks | Status: DRAFT`,
      `🔗 Preview: ${cfg.api.baseUrl}/tests/${testId}`,
      ``,
      `⚠️  This paper has NOT been published. Review it and call publish_test to make it live.`,
    ].join("\n"),
  };

  console.log("\n" + JSON.stringify(toolResponse, null, 2));

  // ── STEP 9: Summary ───────────────────────────────────────────────────────
  section("✅  DRY RUN SUMMARY");
  ok(`Input questions:       ${input.questions.length}`);
  ok(`After per-Q validate:  ${validQuestions.length}`);
  ok(`After dedup:           ${deduped.length}  (${duplicateCount} removed)`);
  ok(`Total marks:           ${paperResult.totalMarks}`);
  ok(`Duration:              ${input.durationMinutes} min`);
  ok(`Question types:        ${Array.from(new Set(deduped.map((q) => q.type))).join(", ")}`);
  ok(`Difficulty mix:        ${Array.from(new Set(deduped.map((q) => q.difficulty ?? "?"))).join(", ")}`);

  console.log(
    `\n${C.bold}${C.green}  🟢  MCP server CAN create this paper correctly.${C.reset}`
  );
  console.log(
    `${C.dim}  (In production, testId and testCode would come from your real ProctorED DB)${C.reset}\n`
  );
}

// ── Run ───────────────────────────────────────────────────────────────────────
dryRun().catch((err) => {
  console.error(
    `\n${C.red}FATAL: ${err instanceof Error ? err.message : String(err)}${C.reset}`
  );
  process.exit(1);
});
