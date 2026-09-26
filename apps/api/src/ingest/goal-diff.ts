/**
 * Which goal numbers for one side are new.
 *
 * `alreadyRecorded` is how many goals that side already has stored, from ANY
 * source. Deduplicating on the running tally rather than on the minute is what
 * makes this correct: the timeline feed and the livescore feed do not agree
 * about the clock, so a goal the timeline places at 24' and the score reveals
 * at 25' is one goal, not two. Matching on minute stored it twice and notified
 * twice; matching on tally cannot, whatever the clocks say.
 *
 * Returns the 1-based goal numbers to emit, in order.
 */
export function newGoalTallies(
  prev: number | null,
  now: number | null,
  alreadyRecorded: number,
): number[] {
  // No baseline to diff against, or the score did not rise. A drop is a
  // provider correction, not a goal.
  if (prev === null || now === null || now <= prev) return [];

  const tallies: number[] = [];
  // A poll can straddle two goals, so emit one per goal rather than one per
  // score change.
  for (let tally = prev + 1; tally <= now; tally++) {
    // The timeline already has this one, under a real scorer's name.
    if (tally <= alreadyRecorded) continue;
    tallies.push(tally);
  }
  return tallies;
}

/**
 * Which goal numbers for one side are no longer real, after the score DROPPED.
 *
 * Scores go down: VAR overturns a goal, or the provider corrects itself. We
 * have already derived that goal, stored it, and pushed a notification for it.
 * The notification cannot be recalled, but the phantom must not sit in the
 * match timeline for good — 4 matches were carrying one.
 *
 * Returns the 1-based goal numbers to retract, so the caller can delete
 * exactly the rows it derived. A goal the provider NAMED is its own claim and
 * is never retracted here.
 */
export function retractedGoalTallies(
  prev: number | null,
  now: number | null,
): number[] {
  if (prev === null || now === null || now >= prev) return [];

  const tallies: number[] = [];
  for (let tally = now + 1; tally <= prev; tally++) tallies.push(tally);
  return tallies;
}
