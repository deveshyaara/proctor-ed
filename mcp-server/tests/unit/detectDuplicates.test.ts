import { isDuplicate, deduplicateBatch } from "../../src/orchestrator/detectDuplicates.js";
import type { GeneratedQuestion } from "../../src/schemas.js";

const q1: GeneratedQuestion = {
  type: "MCQ",
  questionText: "What is the powerhouse of the cell?",
  options: ["Nucleus", "Mitochondria", "Ribosome", "ER"],
  correctOptionIndex: 1,
  marks: 1,
  negativeMarks: 0,
  difficulty: "easy"
};

const q2: GeneratedQuestion = {
  type: "SHORT_ANSWER",
  questionText: "Which organelle is known as the powerhouse of the cell?",
  expectedAnswer: "Mitochondria",
  marks: 1,
  negativeMarks: 0,
  difficulty: "easy"
};

const q3: GeneratedQuestion = {
  type: "MCQ",
  questionText: "Who wrote Romeo and Juliet?",
  options: ["Shakespeare", "Dickens", "Austen", "Poe"],
  correctOptionIndex: 0,
  marks: 1,
  negativeMarks: 0,
  difficulty: "easy"
};

describe("detectDuplicates", () => {
  describe("isDuplicate", () => {
    it("returns true for exact matches", () => {
      expect(isDuplicate(q1, [q1])).toBe(true);
    });

    it("returns true for semantic matches above threshold", () => {
      // q1 and q2 are very similar in words: "powerhouse", "of", "the", "cell"
      // They should trigger the cosine similarity threshold (0.85)
      expect(isDuplicate(q1, [q2])).toBe(true);
    });

    it("returns false for completely different questions", () => {
      expect(isDuplicate(q1, [q3])).toBe(false);
    });
  });

  describe("deduplicateBatch", () => {
    it("filters out duplicates against the existing pool", () => {
      const { accepted, duplicateCount } = deduplicateBatch([q2, q3], [q1]);
      
      expect(accepted).toHaveLength(1);
      expect(accepted[0]).toEqual(q3);
      expect(duplicateCount).toBe(1);
    });

    it("filters out duplicates within the batch itself", () => {
      const { accepted, duplicateCount } = deduplicateBatch([q1, q2], []);
      
      expect(accepted).toHaveLength(1);
      expect(accepted[0]).toEqual(q1); // first one wins
      expect(duplicateCount).toBe(1);
    });
  });
});
