import { newGoalTallies, retractedGoalTallies } from './goal-diff';

describe('newGoalTallies', () => {
  it('emits nothing when the score is unchanged', () => {
    expect(newGoalTallies(1, 1, 1)).toEqual([]);
    expect(newGoalTallies(0, 0, 0)).toEqual([]);
  });

  it('emits one goal for a one-goal rise', () => {
    expect(newGoalTallies(0, 1, 0)).toEqual([1]);
    expect(newGoalTallies(2, 3, 2)).toEqual([3]);
  });

  it('emits both when a poll straddles two goals', () => {
    expect(newGoalTallies(0, 2, 0)).toEqual([1, 2]);
    expect(newGoalTallies(1, 4, 1)).toEqual([2, 3, 4]);
  });

  it('ignores a score going down — that is a provider correction', () => {
    expect(newGoalTallies(2, 1, 2)).toEqual([]);
    expect(newGoalTallies(3, 0, 3)).toEqual([]);
  });

  it('needs a baseline on both sides', () => {
    expect(newGoalTallies(null, 2, 0)).toEqual([]);
    expect(newGoalTallies(0, null, 0)).toEqual([]);
    expect(newGoalTallies(null, null, 0)).toEqual([]);
  });

  // The regression this function exists for.
  it('does not re-emit a goal the timeline already named, whatever the clock says', () => {
    // Timeline stored the 1st home goal (at 24'); the score reveals it at 25'.
    expect(newGoalTallies(0, 1, 1)).toEqual([]);
  });

  it('still emits the goals the timeline has not reached', () => {
    // Timeline has 1 goal; the score says 3. Goals 2 and 3 are genuinely new.
    expect(newGoalTallies(0, 3, 1)).toEqual([2, 3]);
  });

  it('handles two goals for one side inside the same minute', () => {
    // Both derived at the same clock reading; tallies keep them distinct,
    // where matching on minute collapsed them into one.
    expect(newGoalTallies(0, 2, 0)).toEqual([1, 2]);
    // And if the timeline had already named the first of them:
    expect(newGoalTallies(0, 2, 1)).toEqual([2]);
  });

  it('never emits a tally already stored, even on a big jump', () => {
    expect(newGoalTallies(0, 5, 5)).toEqual([]);
    expect(newGoalTallies(0, 5, 3)).toEqual([4, 5]);
  });
});

describe('retractedGoalTallies', () => {
  it('retracts nothing while the score holds or rises', () => {
    expect(retractedGoalTallies(1, 1)).toEqual([]);
    expect(retractedGoalTallies(1, 3)).toEqual([]);
    expect(retractedGoalTallies(0, 0)).toEqual([]);
  });

  it('retracts the goal VAR took away', () => {
    expect(retractedGoalTallies(2, 1)).toEqual([2]);
    expect(retractedGoalTallies(1, 0)).toEqual([1]);
  });

  it('retracts every goal above a larger correction', () => {
    expect(retractedGoalTallies(4, 1)).toEqual([2, 3, 4]);
    expect(retractedGoalTallies(3, 0)).toEqual([1, 2, 3]);
  });

  it('needs both scores', () => {
    expect(retractedGoalTallies(null, 1)).toEqual([]);
    expect(retractedGoalTallies(2, null)).toEqual([]);
  });

  it('is the exact inverse of what was emitted', () => {
    // Emitted goals 1 and 2, then the score is corrected back to 1.
    expect(newGoalTallies(0, 2, 0)).toEqual([1, 2]);
    expect(retractedGoalTallies(2, 1)).toEqual([2]);
    // Goal 1 survives, which is the one that actually counted.
  });
});
