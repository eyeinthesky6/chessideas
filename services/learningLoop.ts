import { DrillOutcome, LearningContractConfig, Theme } from '../types';

/**
 * THE LEARNING LOOP CONTRACT
 * 
 * Objectives:
 * 1. Differentiate Pattern Recognition (System 1) from Calculation (System 2).
 * 2. Enforce strict success criteria.
 * 3. Detect "Tilt" or "Gap" states to prevent reinforcement of bad habits.
 */
export const CONTRACT_CONFIG: LearningContractConfig = {
  perfectTimeThresholdMs: 15000, // < 15s implies Pattern Recognition
  maxRetriesAllowed: 1, // Allow 1 retry (Hint state), 2nd error is absolute failure
  masteryThreshold: 80,
  tiltFailureLimit: 3 // 3 Consecutive failures lock the theme
};

class LearningLoopService {
  
  /**
   * Evaluates a drill attempt against the strict contract.
   */
  public evaluateAttempt(
    isCorrect: boolean,
    durationMs: number,
    retryCount: number
  ): DrillOutcome {
    // 1. Correctness Check
    if (!isCorrect) {
      if (retryCount >= CONTRACT_CONFIG.maxRetriesAllowed) {
        return DrillOutcome.FAILURE;
      }
      return DrillOutcome.SUCCESS_WITH_HINT; // Provisional status until they solve it
    }

    // 2. If Correct:
    
    // If they used a retry previously, it's a Hint Success (regardless of time)
    if (retryCount > 0) {
      return DrillOutcome.SUCCESS_WITH_HINT;
    }

    // 3. Time Check (Speed = Mastery)
    if (durationMs <= CONTRACT_CONFIG.perfectTimeThresholdMs) {
      return DrillOutcome.PERFECT;
    }

    return DrillOutcome.SLOW_SUCCESS;
  }

  /**
   * Check for Stop Condition (Tilt / Knowledge Gap).
   * Returns true if the theme should be locked.
   */
  public checkStopCondition(theme: Theme, recentOutcomes: DrillOutcome[]): boolean {
    if (recentOutcomes.length < CONTRACT_CONFIG.tiltFailureLimit) return false;

    // Get the last N outcomes
    const lastN = recentOutcomes.slice(-CONTRACT_CONFIG.tiltFailureLimit);
    
    // Strict Stop: If ANY 3 in a row are failures
    const consecutiveFailures = lastN.every(o => o === DrillOutcome.FAILURE);
    
    return consecutiveFailures;
  }

  /**
   * User-facing feedback based on the normalized outcome.
   */
  public getOutcomeFeedback(outcome: DrillOutcome): string {
    switch (outcome) {
      case DrillOutcome.PERFECT:
        return "⚡ PERFECT! Pattern recognized immediately.";
      case DrillOutcome.SLOW_SUCCESS:
        return "✅ GOOD. Calculation correct, but try to recognize this faster.";
      case DrillOutcome.SUCCESS_WITH_HINT:
        return "⚠️ RECOVERED. You found it eventually. Review this pattern.";
      case DrillOutcome.FAILURE:
        return "❌ FAILED. Critical gap detected. Theme may be locked if this persists.";
      case DrillOutcome.ABANDONED:
        return "🏳️ SKIPPED.";
      default:
        return "";
    }
  }
}

export const learningLoop = new LearningLoopService();