import { describe, it, expect } from "vitest";
import {
  generateTestCode,
  normalizeTestCode,
} from "@/lib/engines/testCode";

describe("generateTestCode", () => {
  it("generates a code of expected length", () => {
    const code = generateTestCode("Mathematics");
    // 3 letters + 4 digits = 7 chars
    expect(code).toHaveLength(7);
  });

  it("uses subject prefix", () => {
    const code = generateTestCode("Physics");
    expect(code.startsWith("PHY")).toBe(true);
  });

  it("uses only uppercase alphanumeric characters", () => {
    const code = generateTestCode("Science");
    expect(/^[A-Z0-9]+$/.test(code)).toBe(true);
  });

  it("generates different codes on repeated calls", () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generateTestCode("Math"))
    );
    // Very unlikely that all 20 are the same
    expect(codes.size).toBeGreaterThan(1);
  });

  it("handles subjects with non-alpha chars", () => {
    const code = generateTestCode("Math & Science");
    expect(code).toHaveLength(7);
    expect(/^[A-Z0-9]+$/.test(code)).toBe(true);
  });
});

describe("normalizeTestCode", () => {
  it("uppercases a code", () => {
    expect(normalizeTestCode("math7284")).toBe("MATH7284");
  });

  it("trims whitespace", () => {
    expect(normalizeTestCode("  MAT7284  ")).toBe("MAT7284");
  });
});
