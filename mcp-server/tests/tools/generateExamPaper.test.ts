import { generateExamPaperTool } from "../../src/tools/generateExamPaper.js";
import { generateExam } from "../../src/orchestrator/generateExam.js";
import { McpError } from "../../src/errors.js";

// Mock the orchestrator
jest.mock("../../src/orchestrator/generateExam.js", () => ({
  generateExam: jest.fn(),
}));

describe("generateExamPaperTool", () => {
  const validArgs = {
    subject: "Math",
    topic: "Algebra",
    className: "10",
    questionCount: 5,
    questionTypes: ["MCQ"],
    durationMinutes: 30,
    difficultyLevel: "medium",
  };

  it("validates input schema correctly", async () => {
    // Missing required fields
    await expect(generateExamPaperTool.execute({}, "req-1")).rejects.toThrow(McpError);
    await expect(generateExamPaperTool.execute({ subject: "Math" }, "req-1")).rejects.toThrow(McpError);
  });

  it("calls orchestrator and returns formatted success message", async () => {
    const mockResult = {
      testId: "test-123",
      testCode: "ABC-123",
      title: "Algebra — Class 10",
      status: "DRAFT",
      questionCount: 5,
      totalMarks: 5,
      rejectedQuestions: 1,
      duplicatesDetected: 0,
      curriculumVerified: false,
      previewUrl: "http://localhost:3000/tests/test-123",
    };

    (generateExam as jest.Mock).mockResolvedValueOnce(mockResult);

    const result = await generateExamPaperTool.execute(validArgs, "req-1") as any;
    
    expect(result.success).toBe(true);
    expect(result.testId).toBe("test-123");
    expect(result.message).toContain("Created draft exam");
    expect(result.message).toContain("1 questions were rejected");
  });
});
