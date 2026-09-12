import { describe, it, expect } from "vitest";
import { scoreAttempt, ScoringQuestion, StudentAnswer } from "@/lib/exam/scoring";

describe("Scoring Engine (scoreAttempt)", () => {
  const sampleQuestions: ScoringQuestion[] = [
    {
      id: "q1",
      type: "MCQ",
      options: ["Alpha", "Beta", "Gamma", "Delta"],
      correctAnswer: "1", // Beta
      marks: 4,
      negativeMarks: 1,
    },
    {
      id: "q2",
      type: "TRUE_FALSE",
      correctAnswer: "true",
      marks: 2,
      negativeMarks: 0.5,
    },
    {
      id: "q3",
      type: "NUMERICAL",
      correctAnswer: "42.5",
      marks: 3,
      negativeMarks: 0,
    },
    {
      id: "q4",
      type: "SHORT_ANSWER",
      correctAnswer: "Photosynthesis",
      marks: 5,
      negativeMarks: 0,
    },
  ];

  it("1. MCQ without randomization — correct scores full marks", () => {
    const answers: StudentAnswer[] = [{ questionId: "q1", answer: "1" }];
    const result = scoreAttempt([sampleQuestions[0]], answers);
    expect(result.score).toBe(4);
    expect(result.maxScore).toBe(4);
    expect(result.percentage).toBe(100);
    expect(result.answers[0].isCorrect).toBe(true);
    expect(result.answers[0].marksAwarded).toBe(4);
  });

  it("2. MCQ without randomization — incorrect penalizes negative marks", () => {
    const answers: StudentAnswer[] = [{ questionId: "q1", answer: "0" }];
    const result = scoreAttempt([sampleQuestions[0]], answers);
    expect(result.score).toBe(0); // Score bounded at 0
    expect(result.answers[0].isCorrect).toBe(false);
    expect(result.answers[0].marksAwarded).toBe(-1);
  });

  it("3. MCQ with randomization — selected randomized correct option scores correctly", () => {
    // Original: ["Alpha" (0), "Beta" (1 - correct), "Gamma" (2), "Delta" (3)]
    // Shuffled map: [2, 0, 3, 1]
    // Displayed index 0 -> raw index 2 ("Gamma")
    // Displayed index 1 -> raw index 0 ("Alpha")
    // Displayed index 2 -> raw index 3 ("Delta")
    // Displayed index 3 -> raw index 1 ("Beta" - correct!)
    // Student selects displayed option 3:
    const answers: StudentAnswer[] = [{ questionId: "q1", answer: "3" }];
    const optionOrderMap = { q1: [2, 0, 3, 1] };

    const result = scoreAttempt([sampleQuestions[0]], answers, optionOrderMap);
    expect(result.answers[0].isCorrect).toBe(true);
    expect(result.answers[0].marksAwarded).toBe(4);
    expect(result.score).toBe(4);
  });

  it("4. MCQ with randomization — incorrect option scores incorrectly", () => {
    // Shuffled map: [2, 0, 3, 1]
    // Displayed index 0 is "Gamma" (canonical 2, incorrect)
    const answers: StudentAnswer[] = [{ questionId: "q1", answer: "0" }];
    const optionOrderMap = { q1: [2, 0, 3, 1] };

    const result = scoreAttempt([sampleQuestions[0]], answers, optionOrderMap);
    expect(result.answers[0].isCorrect).toBe(false);
    expect(result.answers[0].marksAwarded).toBe(-1);
  });

  it("5. option order persisted across re-evaluation yields identical score", () => {
    const answers: StudentAnswer[] = [{ questionId: "q1", answer: "3" }];
    const optionOrderMap = { q1: [2, 0, 3, 1] };

    const run1 = scoreAttempt([sampleQuestions[0]], answers, optionOrderMap);
    const run2 = scoreAttempt([sampleQuestions[0]], answers, optionOrderMap);
    expect(run1).toEqual(run2);
  });

  it("6. negative marking with randomized options correctly applies deduction", () => {
    const qWithHighBase: ScoringQuestion[] = [
      sampleQuestions[1], // +2
      sampleQuestions[0], // -1 if wrong
    ];
    // Student gets q2 right (+2), but q1 wrong (-1)
    const answers: StudentAnswer[] = [
      { questionId: "q2", answer: "true" },
      { questionId: "q1", answer: "1" }, // In shuffled [2, 0, 3, 1], displayed 1 is "Alpha" (canonical 0, wrong)
    ];
    const optionOrderMap = { q1: [2, 0, 3, 1] };

    const result = scoreAttempt(qWithHighBase, answers, optionOrderMap);
    expect(result.answers[0].marksAwarded).toBe(2);
    expect(result.answers[1].marksAwarded).toBe(-1);
    expect(result.score).toBe(1); // 2 - 1 = 1
    expect(result.maxScore).toBe(6);
  });

  it("7. multiple randomized questions score independently with distinct maps", () => {
    const q1: ScoringQuestion = {
      id: "q1",
      type: "MCQ",
      options: ["A", "B", "C", "D"],
      correctAnswer: "0", // "A"
      marks: 5,
      negativeMarks: 0,
    };
    const q2: ScoringQuestion = {
      id: "q2",
      type: "MCQ",
      options: ["W", "X", "Y", "Z"],
      correctAnswer: "3", // "Z"
      marks: 5,
      negativeMarks: 0,
    };

    // q1 map: [1, 2, 3, 0] -> displayed 3 is canonical 0 ("A")
    // q2 map: [3, 2, 1, 0] -> displayed 0 is canonical 3 ("Z")
    const optionOrderMap = {
      q1: [1, 2, 3, 0],
      q2: [3, 2, 1, 0],
    };

    const answers: StudentAnswer[] = [
      { questionId: "q1", answer: "3" }, // correct for q1
      { questionId: "q2", answer: "0" }, // correct for q2
    ];

    const result = scoreAttempt([q1, q2], answers, optionOrderMap);
    expect(result.score).toBe(10);
    expect(result.percentage).toBe(100);
    expect(result.answers[0].isCorrect).toBe(true);
    expect(result.answers[1].isCorrect).toBe(true);
  });

  it("8. different randomized permutations correctly resolve canonical indices", () => {
    const q: ScoringQuestion = {
      id: "q",
      type: "MCQ",
      options: ["Zero", "One", "Two", "Three", "Four"],
      correctAnswer: "4", // "Four"
      marks: 2,
      negativeMarks: 0,
    };

    // Permutation 1: Four is at displayed index 0 -> [4, 3, 2, 1, 0]
    expect(scoreAttempt([q], [{ questionId: "q", answer: "0" }], { q: [4, 3, 2, 1, 0] }).score).toBe(2);

    // Permutation 2: Four is at displayed index 2 -> [0, 1, 4, 3, 2]
    expect(scoreAttempt([q], [{ questionId: "q", answer: "2" }], { q: [0, 1, 4, 3, 2] }).score).toBe(2);

    // Permutation 3: Four is at displayed index 4 -> [0, 1, 2, 3, 4]
    expect(scoreAttempt([q], [{ questionId: "q", answer: "4" }], { q: [0, 1, 2, 3, 4] }).score).toBe(2);
  });

  it("9. no mapping available → fail safely and score against direct index", () => {
    // No optionOrderMap provided
    const answers: StudentAnswer[] = [{ questionId: "q1", answer: "1" }];
    const result = scoreAttempt([sampleQuestions[0]], answers, null);
    expect(result.score).toBe(4); // Matches canonical "1" directly
    expect(result.answers[0].isCorrect).toBe(true);
  });

  it("10. malicious client sends canonical index instead of randomized index → server follows authoritative attempt mapping", () => {
    // Shuffled map: [2, 0, 3, 1]
    // Correct canonical index is 1 ("Beta")
    // If malicious student sniffs network or guesses canonical index 1 and sends "1",
    // the server translates displayed 1 -> canonical 0 ("Alpha"), which is INCORRECT!
    const answers: StudentAnswer[] = [{ questionId: "q1", answer: "1" }];
    const optionOrderMap = { q1: [2, 0, 3, 1] };

    const result = scoreAttempt([sampleQuestions[0]], answers, optionOrderMap);
    expect(result.answers[0].isCorrect).toBe(false);
    expect(result.answers[0].marksAwarded).toBe(-1);
  });

  it("handles mixed types: True/False, Numerical tolerance, and Short Answer", () => {
    const answers: StudentAnswer[] = [
      { questionId: "q2", answer: "TRUE" }, // case insensitive
      { questionId: "q3", answer: "42.5001" }, // within 0.001 tolerance
      { questionId: "q4", answer: "  photosynthesis  " }, // trimmed, case insensitive
    ];

    const result = scoreAttempt([sampleQuestions[1], sampleQuestions[2], sampleQuestions[3]], answers);
    expect(result.score).toBe(10); // 2 + 3 + 5
    expect(result.answers.every((a) => a.isCorrect)).toBe(true);
  });

  it("handles unanswered questions gracefully without negative marking", () => {
    const answers: StudentAnswer[] = [
      { questionId: "q1", answer: null },
      { questionId: "q2", answer: "" },
    ];

    const result = scoreAttempt([sampleQuestions[0], sampleQuestions[1]], answers);
    expect(result.score).toBe(0);
    expect(result.answers[0].isCorrect).toBe(null);
    expect(result.answers[0].marksAwarded).toBe(0);
    expect(result.answers[1].isCorrect).toBe(null);
    expect(result.answers[1].marksAwarded).toBe(0);
  });
});
