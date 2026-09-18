import { describe, expect, it } from 'vitest';

import { probeRegex } from '../evaluator/redos-probe';

const LONG_RUN = 'a'.repeat(10_000) + '!';

describe('probing a regex under a deadline', () => {
  it('terminates a match that would never return', async () => {
    // The property the whole design rests on. `(a+)+$` over this fixture is
    // 2^10000 backtracks: measured in-process it does not return at all, and
    // the 17 ms / 209 ms / 832 ms curve at 18 / 24 / 26 characters is what
    // says why a longer fixture is hopeless. Here it costs the budget.
    const started = Date.now();
    const outcome = await probeRegex({
      source: '(a+)+$',
      flags: 'gu',
      fixture: LONG_RUN,
      budgetMs: 50,
    });

    expect(outcome).toEqual({ kind: 'timed-out', budgetMs: 50 });
    expect(Date.now() - started).toBeLessThan(5_000);
  }, 20_000);

  it('reports a run that finishes, with what it measured', async () => {
    const outcome = await probeRegex({
      source: '(a+)+$',
      flags: 'gu',
      // Short enough to finish: the same pattern, bounded by the input.
      fixture: 'a'.repeat(22) + '!',
      budgetMs: 10_000,
    });

    expect(outcome.kind).toBe('completed');
    if (outcome.kind === 'completed') {
      expect(outcome.elapsedMs).not.toBeNull();
    }
  }, 20_000);

  it('completes in no measurable time for an ordinary pattern', async () => {
    const outcome = await probeRegex({
      source: '\\d{4}',
      flags: 'gu',
      fixture: LONG_RUN,
      budgetMs: 50,
    });

    expect(outcome.kind).toBe('completed');
  }, 20_000);

  it('does not charge worker startup against the match budget', async () => {
    // The regression this exists for. The budget used to start when the worker
    // was spawned, so on a loaded machine the deadline could fire before the
    // regex had even compiled — and an ordinary pattern was refused. It showed
    // up as `\\d{4}-\\d{4}` failing during a verify run with every workspace
    // building at once, which is the worst way to find it: reproducible for the
    // operator, green for us.
    //
    // A 5 ms budget is below any plausible worker startup, so this passes only
    // because the clock starts at the match.
    const outcome = await probeRegex({
      source: '\\d{4}-\\d{4}',
      flags: 'gu',
      fixture: LONG_RUN,
      budgetMs: 5,
    });

    expect(outcome.kind).toBe('completed');
  }, 20_000);

  it('reports a pattern the worker cannot compile', async () => {
    const outcome = await probeRegex({
      source: '([a-z',
      flags: 'gu',
      fixture: 'abc',
      budgetMs: 50,
    });

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.message).toBeTruthy();
    }
  }, 20_000);
});
