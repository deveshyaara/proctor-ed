import { describe, it, expect } from "vitest";
import {
  isLegalTransition,
  assertLegalTransition,
  isTerminal,
  TERMINAL_STATUSES,
  StateMachineError,
} from "@/lib/exam/stateMachine";
import type { AttemptStatus } from "@prisma/client";

describe("Attempt State Machine", () => {
  it("allows CREATED -> IN_PROGRESS", () => {
    expect(isLegalTransition("CREATED", "IN_PROGRESS")).toBe(true);
    expect(() => assertLegalTransition("CREATED", "IN_PROGRESS")).not.toThrow();
  });

  it("allows IN_PROGRESS -> SUBMITTED, AUTO_SUBMITTED, TERMINATED, EXPIRED", () => {
    const validTargets: AttemptStatus[] = ["SUBMITTED", "AUTO_SUBMITTED", "TERMINATED", "EXPIRED"];
    for (const target of validTargets) {
      expect(isLegalTransition("IN_PROGRESS", target)).toBe(true);
      expect(() => assertLegalTransition("IN_PROGRESS", target)).not.toThrow();
    }
  });

  it("rejects illegal transitions from CREATED", () => {
    const invalidTargets: AttemptStatus[] = ["SUBMITTED", "AUTO_SUBMITTED", "TERMINATED", "EXPIRED", "CREATED"];
    for (const target of invalidTargets) {
      expect(isLegalTransition("CREATED", target)).toBe(false);
      expect(() => assertLegalTransition("CREATED", target)).toThrow(StateMachineError);
    }
  });

  it("rejects mutations from terminal states", () => {
    const allStatuses: AttemptStatus[] = ["CREATED", "IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED", "TERMINATED", "EXPIRED"];
    for (const terminal of TERMINAL_STATUSES) {
      expect(isTerminal(terminal)).toBe(true);
      for (const target of allStatuses) {
        expect(isLegalTransition(terminal, target)).toBe(false);
        expect(() => assertLegalTransition(terminal, target)).toThrow(StateMachineError);
      }
    }
  });

  it("identifies non-terminal states correctly", () => {
    expect(isTerminal("CREATED")).toBe(false);
    expect(isTerminal("IN_PROGRESS")).toBe(false);
  });
});
