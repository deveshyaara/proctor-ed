import { describe, it, expect } from "vitest";
import {
  toStudentQuestions,
  shuffleQuestionIds,
  shuffleOptionMap,
  unshuffleOptionIndex,
} from "@/lib/exam/questions";
import type { Question } from "@prisma/client";

describe("Question Utilities (questions.ts)", () => {
  const dummyQuestions: Question[] = [
    {
      id: "q1",
      testId: "t1",
      type: "MCQ",
      questionText: "What is 2+2?",
      imageUrl: null,
      imageKey: "secret_key_1",
      options: ["1", "2", "3", "4"],
      correctAnswer: "3", // "4"
      marks: 2,
      negativeMarks: 0.5,
      explanation: "Basic addition",
      order: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "q2",
      testId: "t1",
      type: "TRUE_FALSE",
      questionText: "The sky is green.",
      imageUrl: null,
      imageKey: "secret_key_2",
      options: null,
      correctAnswer: "false",
      marks: 1,
      negativeMarks: 0,
      explanation: "Sky is blue",
      order: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it("strips correctAnswer, explanation, and imageKey from student view", () => {
    const studentQs = toStudentQuestions(dummyQuestions);
    expect(studentQs).toHaveLength(2);

    for (const q of studentQs) {
      expect((q as unknown as Record<string, unknown>).correctAnswer).toBeUndefined();
      expect((q as unknown as Record<string, unknown>).explanation).toBeUndefined();
      expect((q as unknown as Record<string, unknown>).imageKey).toBeUndefined();
      expect(q.id).toBeDefined();
      expect(q.questionText).toBeDefined();
      expect(q.marks).toBeDefined();
    }
  });

  it("respects questionOrder when provided", () => {
    const reversedOrder = ["q2", "q1"];
    const studentQs = toStudentQuestions(dummyQuestions, reversedOrder);
    expect(studentQs[0].id).toBe("q2");
    expect(studentQs[0].order).toBe(1);
    expect(studentQs[1].id).toBe("q1");
    expect(studentQs[1].order).toBe(2);
  });

  it("applies optionOrderMap to shuffle MCQ options for students", () => {
    // Option map: [3, 2, 1, 0] -> reverses options
    const optionOrderMap = { q1: [3, 2, 1, 0] };
    const studentQs = toStudentQuestions(dummyQuestions, undefined, optionOrderMap);

    expect(studentQs[0].options).toEqual(["4", "3", "2", "1"]);
  });

  it("shuffleQuestionIds returns a permutation of identical length containing all IDs", () => {
    const ids = ["q1", "q2", "q3", "q4", "q5"];
    const shuffled = shuffleQuestionIds(ids);
    expect(shuffled).toHaveLength(ids.length);
    expect(new Set(shuffled)).toEqual(new Set(ids));
  });

  it("shuffleOptionMap generates valid permutations for MCQs only", () => {
    const map = shuffleOptionMap(dummyQuestions);
    expect(map.q1).toBeDefined();
    expect(map.q1).toHaveLength(4);
    expect(new Set(map.q1)).toEqual(new Set([0, 1, 2, 3]));
    expect(map.q2).toBeUndefined(); // True/False has no options
  });

  it("unshuffleOptionIndex maps visible randomized index back to canonical index", () => {
    const originalIndices = [2, 0, 3, 1];
    // Displayed index 0 was canonical 2
    expect(unshuffleOptionIndex(0, originalIndices)).toBe(2);
    // Displayed index 1 was canonical 0
    expect(unshuffleOptionIndex(1, originalIndices)).toBe(0);
    // Displayed index 2 was canonical 3
    expect(unshuffleOptionIndex(2, originalIndices)).toBe(3);
    // Displayed index 3 was canonical 1
    expect(unshuffleOptionIndex(3, originalIndices)).toBe(1);
  });
});
