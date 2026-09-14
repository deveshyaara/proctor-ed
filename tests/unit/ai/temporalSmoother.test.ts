import { describe, it, expect, beforeEach } from "vitest";
import { TemporalSmoother } from "@/lib/ai/evidence/temporalSmoother";

describe("TemporalSmoother", () => {
  let smoother: TemporalSmoother;

  beforeEach(() => {
    smoother = new TemporalSmoother([
      { type: 'PERSON_MISSING', minConfidence: 0.6, sustainedMs: 3000, recoveryMs: 500 }
    ]);
  });

  it("should not trigger on brief false-positives (e.g. blinks, brief lookaway)", () => {
    const now = Date.now();
    
    // T=0: face missing
    let events = smoother.processFrame({ PERSON_MISSING: { detected: true, confidence: 0.8 }, MULTIPLE_PEOPLE: { detected: false, confidence: 0 }, PROLONGED_GAZE_DEVIATION: { detected: false, confidence: 0 } }, now);
    expect(events).toHaveLength(0);

    // T=1000: face still missing
    events = smoother.processFrame({ PERSON_MISSING: { detected: true, confidence: 0.8 }, MULTIPLE_PEOPLE: { detected: false, confidence: 0 }, PROLONGED_GAZE_DEVIATION: { detected: false, confidence: 0 } }, now + 1000);
    expect(events).toHaveLength(0);

    // T=1500: face returns (blink ends)
    events = smoother.processFrame({ PERSON_MISSING: { detected: false, confidence: 0.0 }, MULTIPLE_PEOPLE: { detected: false, confidence: 0 }, PROLONGED_GAZE_DEVIATION: { detected: false, confidence: 0 } }, now + 1500);
    expect(events).toHaveLength(0);

    // T=3500: if it was a real lookaway, it would trigger now, but it was interrupted
    events = smoother.processFrame({ PERSON_MISSING: { detected: true, confidence: 0.8 }, MULTIPLE_PEOPLE: { detected: false, confidence: 0 }, PROLONGED_GAZE_DEVIATION: { detected: false, confidence: 0 } }, now + 3500);
    expect(events).toHaveLength(0); // Should reset and start over
  });

  it("should trigger after sustained presence", () => {
    const now = Date.now();
    
    // T=0: face missing
    smoother.processFrame({ PERSON_MISSING: { detected: true, confidence: 0.8 }, MULTIPLE_PEOPLE: { detected: false, confidence: 0 }, PROLONGED_GAZE_DEVIATION: { detected: false, confidence: 0 } }, now);

    // T=3000: face still missing, triggers
    const events = smoother.processFrame({ PERSON_MISSING: { detected: true, confidence: 0.9 }, MULTIPLE_PEOPLE: { detected: false, confidence: 0 }, PROLONGED_GAZE_DEVIATION: { detected: false, confidence: 0 } }, now + 3000);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("PERSON_MISSING");
    expect(events[0].confidence).toBe(0.9);
  });
});
