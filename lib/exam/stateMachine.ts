import type { AttemptStatus } from "@prisma/client";

/**
 * Legal attempt state transitions.
 * Any transition not in this map is rejected with a 409.
 */
const LEGAL_TRANSITIONS: Partial<Record<AttemptStatus, AttemptStatus[]>> = {
  CREATED: ["IN_PROGRESS"],
  IN_PROGRESS: ["IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED", "TERMINATED", "EXPIRED"], // IN_PROGRESS→IN_PROGRESS for idempotency
};

export function isLegalTransition(
  from: AttemptStatus,
  to: AttemptStatus
): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertLegalTransition(
  from: AttemptStatus,
  to: AttemptStatus
): void {
  if (!isLegalTransition(from, to)) {
    throw new StateMachineError(
      `Invalid transition: ${from} → ${to}`,
      "INVALID_TRANSITION"
    );
  }
}

/** Terminal statuses — no further mutations allowed */
export const TERMINAL_STATUSES: AttemptStatus[] = [
  "SUBMITTED",
  "AUTO_SUBMITTED",
  "TERMINATED",
  "EXPIRED",
];

export function isTerminal(status: AttemptStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export class StateMachineError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "StateMachineError";
    this.code = code;
  }
}
