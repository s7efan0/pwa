import { IngestService } from './ingest.service';

type Row = {
  id: string;
  externalId: string;
  homeTeamId: string;
  awayTeamId: string;
};

const row = (n: number): Row => ({
  id: `m${n}`,
  externalId: `e${n}`,
  homeTeamId: 'h',
  awayTeamId: 'a',
});

/**
 * The parts of IngestService this exercises. Declared rather than derived
 * from the class: sweepTimelines and its cursor are private, and an
 * intersection with the class type leaves them unresolvable.
 */
type SweepInternals = {
  timelineCheckedAt: Map<string, number>;
  timelineFrozen: Set<string>;
  logger: { debug: (message: string) => void };
  fetchTimeline: (match: Row) => Promise<{ fresh: unknown[]; total: number }>;
  sweepTimelines: (rows: Row[]) => Promise<number>;
};

/**
 * The rotation is pure scheduling, but the rest of IngestService needs a
 * database, an HTTP client and an event bus. Build a bare instance off the
 * prototype and replace only the call that would reach the network.
 */
function makeService(
  fetched: string[][],
  entriesFor: (id: string) => number = () => 0,
) {
  const svc = Object.create(IngestService.prototype) as SweepInternals;
  svc.timelineCheckedAt = new Map<string, number>();
  svc.timelineFrozen = new Set<string>();
  svc.logger = { debug: () => undefined };

  let current: string[] = [];
  // Stands in for the real fetch, including the freeze the real one applies
  // when the provider truncates at the cap.
  svc.fetchTimeline = (match: Row) => {
    current.push(match.id);
    const total = entriesFor(match.id);
    if (total >= 5) svc.timelineFrozen.add(match.id);
    return Promise.resolve({ fresh: [], total });
  };

  return {
    async cycle(rows: Row[]) {
      current = [];
      await svc.sweepTimelines(rows);
      fetched.push([...current]);
    },
    map: () => svc.timelineCheckedAt,
    frozen: () => svc.timelineFrozen,
  };
}

describe('timeline round-robin', () => {
  it('spends at most the per-cycle budget', async () => {
    const fetched: string[][] = [];
    const s = makeService(fetched);
    await s.cycle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(row));
    expect(fetched[0]).toHaveLength(4);
  });

  it('reaches every match in turn instead of repeating the first few', async () => {
    const fetched: string[][] = [];
    const s = makeService(fetched);
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(row);

    // 12 matches, 4 a cycle => a full pass takes 3 cycles (90s at 30s/cycle).
    for (let i = 0; i < 3; i++) await s.cycle(rows);

    const seen = fetched.flat();
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12); // every match exactly once
  });

  it('does not revisit a match before the others have had a turn', async () => {
    const fetched: string[][] = [];
    const s = makeService(fetched);
    const rows = [1, 2, 3, 4, 5, 6].map(row);

    await s.cycle(rows);
    await s.cycle(rows);

    // Cycle 1 served 4 of the 6; the 2 it skipped must go first in cycle 2.
    const skipped = rows
      .map((r) => r.id)
      .filter((id) => !fetched[0].includes(id));
    expect(skipped).toHaveLength(2);
    expect(fetched[1].slice(0, 2).sort()).toEqual(skipped.sort());
  });

  it('prefers a match it has never checked', async () => {
    const fetched: string[][] = [];
    const s = makeService(fetched);
    const rows = [1, 2, 3, 4].map(row);
    await s.cycle(rows); // all four checked

    const withNewcomer = [...rows, row(99)];
    await s.cycle(withNewcomer);
    expect(fetched[1][0]).toBe('m99');
  });

  it('retires a match once its timeline hits the cap', async () => {
    const fetched: string[][] = [];
    // m1 is truncated at the cap; the rest are still growing.
    const s = makeService(fetched, (id) => (id === 'm1' ? 5 : 2));
    const rows = [1, 2, 3].map(row);

    await s.cycle(rows);
    expect(fetched[0]).toContain('m1');
    expect([...s.frozen()]).toEqual(['m1']);

    // Every later cycle must skip it — nothing new can come back.
    await s.cycle(rows);
    await s.cycle(rows);
    expect(fetched[1]).not.toContain('m1');
    expect(fetched[2]).not.toContain('m1');
  });

  it('stops spending entirely once every match is capped', async () => {
    const fetched: string[][] = [];
    const s = makeService(fetched, () => 5);
    const rows = [1, 2, 3, 4].map(row);

    await s.cycle(rows);
    expect(fetched[0]).toHaveLength(4); // first pass still costs one each
    await s.cycle(rows);
    await s.cycle(rows);
    expect(fetched[1]).toHaveLength(0); // then nothing, forever
    expect(fetched[2]).toHaveLength(0);
  });

  it('keeps polling a match sitting just under the cap', async () => {
    const fetched: string[][] = [];
    const s = makeService(fetched, () => 4);
    const rows = [row(1)];

    await s.cycle(rows);
    await s.cycle(rows);
    expect(fetched[0]).toEqual(['m1']);
    expect(fetched[1]).toEqual(['m1']);
    expect(s.frozen().size).toBe(0);
  });

  it('forgets a frozen match once it stops playing', async () => {
    const fetched: string[][] = [];
    const s = makeService(fetched, () => 5);
    await s.cycle([row(1), row(2)]);
    expect(s.frozen().size).toBe(2);

    await s.cycle([row(1)]); // m2 finished
    expect([...s.frozen()]).toEqual(['m1']);
  });

  it('forgets matches that are no longer in play', async () => {
    const fetched: string[][] = [];
    const s = makeService(fetched);
    await s.cycle([1, 2, 3, 4].map(row));
    expect(s.map().size).toBe(4);

    await s.cycle([row(1)]); // the rest have finished
    expect([...s.map().keys()]).toEqual(['m1']);

    await s.cycle([]); // nothing live at all
    expect(s.map().size).toBe(0);
  });
});
