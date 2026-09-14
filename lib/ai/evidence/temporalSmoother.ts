export type EvidenceType = 'PERSON_MISSING' | 'MULTIPLE_PEOPLE' | 'PROLONGED_GAZE_DEVIATION';

export interface SmootherState {
  type: EvidenceType;
  status: 'INACTIVE' | 'SUSPECTED' | 'CONFIRMED' | 'RECOVERING';
  suspectStartTime: number | null;
  recoveryStartTime: number | null;
  highestConfidence: number;
}

export class TemporalSmoother {
  private state: Map<EvidenceType, SmootherState> = new Map();

  constructor(private thresholds: {
    type: EvidenceType,
    minConfidence: number,
    sustainedMs: number,
    recoveryMs: number
  }[]) {
    thresholds.forEach(t => {
      this.state.set(t.type, {
        type: t.type,
        status: 'INACTIVE',
        suspectStartTime: null,
        recoveryStartTime: null,
        highestConfidence: 0
      });
    });
  }

  /**
   * Process a single frame's raw signals.
   * Returns a list of CONFIRMED evidence types in this tick.
   */
  processFrame(signals: Record<EvidenceType, { detected: boolean; confidence: number }>, now: number = Date.now()): Array<{ type: EvidenceType, confidence: number, durationMs: number }> {
    const confirmedEvents: Array<{ type: EvidenceType, confidence: number, durationMs: number }> = [];

    for (const threshold of this.thresholds) {
      const state = this.state.get(threshold.type)!;
      const signal = signals[threshold.type];
      
      const isTriggered = signal.detected && signal.confidence >= threshold.minConfidence;

      if (isTriggered) {
        state.highestConfidence = Math.max(state.highestConfidence, signal.confidence);
        state.recoveryStartTime = null; // reset recovery

        if (state.status === 'INACTIVE' || state.status === 'RECOVERING') {
          state.status = 'SUSPECTED';
          state.suspectStartTime = now;
        } else if (state.status === 'SUSPECTED') {
          const duration = now - (state.suspectStartTime ?? now);
          if (duration >= threshold.sustainedMs) {
            state.status = 'CONFIRMED';
            confirmedEvents.push({ type: threshold.type, confidence: state.highestConfidence, durationMs: duration });
          }
        } else if (state.status === 'CONFIRMED') {
          // Already confirmed, waiting for recovery
          state.highestConfidence = Math.max(state.highestConfidence, signal.confidence);
        }
      } else {
        // Not triggered this frame
        if (state.status === 'SUSPECTED') {
          // brief false-positive, reset
          state.status = 'INACTIVE';
          state.suspectStartTime = null;
          state.highestConfidence = 0;
        } else if (state.status === 'CONFIRMED') {
          if (state.recoveryStartTime === null) {
            state.status = 'RECOVERING';
            state.recoveryStartTime = now;
          } else {
            const recoveryDuration = now - state.recoveryStartTime;
            if (recoveryDuration >= threshold.recoveryMs) {
              state.status = 'INACTIVE';
              state.suspectStartTime = null;
              state.recoveryStartTime = null;
              state.highestConfidence = 0;
            }
          }
        } else if (state.status === 'RECOVERING') {
          const recoveryDuration = now - (state.recoveryStartTime ?? now);
          if (recoveryDuration >= threshold.recoveryMs) {
            state.status = 'INACTIVE';
            state.suspectStartTime = null;
            state.recoveryStartTime = null;
            state.highestConfidence = 0;
          }
        }
      }
    }

    return confirmedEvents;
  }
}
