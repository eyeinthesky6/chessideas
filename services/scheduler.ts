import { DrillSchedule, IScheduler, DrillOutcome } from '../types';
import { INITIAL_SCHEDULE_SETTINGS } from '../constants';

/**
 * Implementation of the SuperMemo 2 (SM-2) algorithm for spaced repetition.
 * Maps normalized DrillOutcome to SM-2 Grades (0-5).
 */
class Sm2Scheduler implements IScheduler {
  
  public createInitialSchedule(drillId: string): DrillSchedule {
    return {
      drillId,
      nextDueAt: Date.now(),
      interval: 0,
      repetition: 0,
      easeFactor: INITIAL_SCHEDULE_SETTINGS.initialEase,
    };
  }

  private mapOutcomeToGrade(outcome: DrillOutcome): number {
    switch (outcome) {
      case DrillOutcome.PERFECT: return 5;
      case DrillOutcome.SLOW_SUCCESS: return 4;
      case DrillOutcome.SUCCESS_WITH_HINT: return 3;
      case DrillOutcome.FAILURE: return 1;
      case DrillOutcome.ABANDONED: return 0;
      default: return 3;
    }
  }

  public calculateNext(current: DrillSchedule, outcome: DrillOutcome): DrillSchedule {
    let { interval, repetition, easeFactor } = current;
    const grade = this.mapOutcomeToGrade(outcome);

    if (grade >= 3) {
      if (repetition === 0) {
        interval = 1;
      } else if (repetition === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }
      repetition += 1;
    } else {
      // If incorrect, reset rep count but keep ease factor slightly adjusted
      repetition = 0;
      interval = 1; // Revisit tomorrow (or sooner if we implemented strict queues)
    }

    // Update Ease Factor
    // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    easeFactor = easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    // Convert days to milliseconds for next due date
    const nextDueAt = Date.now() + (interval * 24 * 60 * 60 * 1000);

    return {
      drillId: current.drillId,
      nextDueAt,
      interval,
      repetition,
      easeFactor,
    };
  }
}

export const scheduler = new Sm2Scheduler();