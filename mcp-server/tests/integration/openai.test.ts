import { OpenAIProvider } from "../../src/providers/openai.js";
import { getConfig } from "../../src/config.js";

// Skip this suite if OPENAI_API_KEY is not set in environment
const hasKey = !!process.env.OPENAI_API_KEY;

(hasKey ? describe : describe.skip)("OpenAIProvider Integration", () => {
  let provider: OpenAIProvider;

  beforeAll(() => {
    // Force config to load, which throws if OPENAI_API_KEY is missing
    getConfig();
    provider = new OpenAIProvider();
  });

  it("generates a valid MCQ batch using structured outputs", async () => {
    const batch = await provider.generateBatch({
      subject: "Science",
      topic: "Planets",
      className: "8",
      questionType: "MCQ",
      difficulty: "easy",
      count: 2,
      marksPerQuestion: 1,
      negativeMarks: 0,
      requestId: "test-req",
    });

    expect(batch).toHaveLength(2);
    expect(batch[0]?.type).toBe("MCQ");
    
    const q1 = batch[0] as any;
    expect(q1.questionText).toBeDefined();
    expect(q1.options).toHaveLength(4); // Or at least 2 depending on model choice, schema requires 2-6
    expect(typeof q1.correctOptionIndex).toBe("number");
  }, 30000); // 30s timeout for LLM call

  it("verifies a question successfully", async () => {
    const validQuestion = {
      type: "TRUE_FALSE",
      questionText: "The Earth revolves around the Sun.",
      correctAnswer: true,
      marks: 1,
      negativeMarks: 0,
      difficulty: "easy"
    } as any;

    const result = await provider.verifyQuestion(validQuestion, { subject: "Science", topic: "Planets" });
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
  }, 30000);
});
