import { SkillState, DrillOutcome } from '../types';

/**
 * Interface for Skill Update Policies.
 */
export interface ISkillUpdatePolicy {
  update(currentState: SkillState, outcome: DrillOutcome, drillDifficulty: number): SkillState;
}

/**
 * Advanced Glicko-inspired Policy.
 * Adjusts mastery based on:
 * 1. Difficulty of the drill vs User Mastery.
 * 2. Certainty (Confidence) of the user's current rating.
 * 3. Actual Outcome vs Expected Outcome.
 */
class AdvancedSkillPolicy implements ISkillUpdatePolicy {
  
  // Maps Drill Difficulty (1-5) to a Mastery Scale (0-100)
  private getDrillRating(difficulty: number): number {
    // 1 -> 20, 2 -> 40, 3 -> 60, 4 -> 80, 5 -> 100
    return Math.min(100, Math.max(10, difficulty * 20));
  }

  // Logistic function to calculate Expected Score (0.0 - 1.0)
  private getExpectedScore(userMastery: number, drillRating: number): number {
    // A difference of 40 points implies a 10x difference in odds (standard logistic curve width)
    // Adjusted scale: 25 points difference = significant edge.
    const diff = userMastery - drillRating;
    return 1 / (1 + Math.pow(10, -diff / 40));
  }

  private getPerformanceScore(outcome: DrillOutcome): number {
    switch (outcome) {
      case DrillOutcome.PERFECT: return 1.0;
      case DrillOutcome.SLOW_SUCCESS: return 0.85; // Penalty for slowness
      case DrillOutcome.SUCCESS_WITH_HINT: return 0.5; // Half credit
      case DrillOutcome.FAILURE: return 0.0;
      case DrillOutcome.ABANDONED: return 0.0;
      default: return 0.0;
    }
  }

  public update(currentState: SkillState, outcome: DrillOutcome, drillDifficulty: number): SkillState {
    const drillRating = this.getDrillRating(drillDifficulty);
    const expectedScore = this.getExpectedScore(currentState.mastery, drillRating);
    const actualScore = this.getPerformanceScore(outcome);

    // K-Factor determines volatility. 
    // If we are confident (1.0), K is low (stable).
    // If we are uncertain (0.0), K is high (volatile).
    const baseK = 20; 
    const volatilityFactor = 1.0 - (currentState.confidence * 0.5); // Range 0.5 - 1.0
    const kFactor = baseK * volatilityFactor;

    const rawDelta = kFactor * (actualScore - expectedScore);

    let newMastery = currentState.mastery + rawDelta;
    newMastery = Math.max(0, Math.min(100, newMastery));

    // Update Confidence (Volatility)
    // If the outcome was a "Surprise" (large difference between expected and actual), decrease confidence.
    // If the outcome was "As Expected", increase confidence.
    const surprise = Math.abs(actualScore - expectedScore);
    
    let newConfidence = currentState.confidence;
    if (surprise > 0.5) {
      // Surprise! User failed an easy task OR aced a hard one. Increase uncertainty.
      newConfidence -= 0.1;
    } else {
      // Consistent. Increase certainty.
      newConfidence += 0.05;
    }
    
    // Clamp Confidence
    newConfidence = Math.max(0.0, Math.min(1.0, newConfidence));

    // Update Streak
    let newStreak = currentState.streak;
    if (actualScore >= 0.8) {
      newStreak += 1;
    } else {
      newStreak = 0;
    }

    return {
      mastery: parseFloat(newMastery.toFixed(2)),
      confidence: parseFloat(newConfidence.toFixed(2)),
      streak: newStreak,
      lastPracticed: Date.now()
    };
  }
}

// Singleton instance
const policy = new AdvancedSkillPolicy();

/**
 * Public API for updating skill state.
 */
export const updateSkill = (currentSkill: SkillState, outcome: DrillOutcome, drillDifficulty: number): SkillState => {
  return policy.update(currentSkill, outcome, drillDifficulty);
};

export const createInitialSkill = (): SkillState => ({
  mastery: 40, // Start slightly below average (assuming novice-intermediate target)
  confidence: 0.2, // Start with high uncertainty
  streak: 0,
  lastPracticed: 0
});