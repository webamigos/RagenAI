import { describe, expect, it } from 'vitest';

import {
  disagreements,
  environmentSaysEnabled,
  missingRules,
} from '../../scripts/guardrails-preflight.mts';

/**
 * The comparison this script exists to make, tested without a database.
 *
 * The script's value is entirely in the pure half: given what the environment
 * says and what the panel holds, does it call the dangerous combination
 * dangerous? Everything else is a Prisma query and some padding.
 */

const rules = (entries: Record<string, boolean>) =>
  new Map(Object.entries(entries));

const BOTH_PRESENT = {
  'content-moderation': false,
  'jailbreak-detection': false,
};

describe('environmentSaysEnabled', () => {
  it('reads MODERATION_ENABLED the way shouldModerate() reads it', () => {
    // `basic-rag/chain.ts` asks `=== '1'` and nothing else. A preflight that
    // accepted `true` here would report a deployment as protected today when
    // the chain is not moderating it — the exact direction that loses
    // protection quietly.
    const strict = environmentSaysEnabled({ MODERATION_ENABLED: 'true' });
    expect(strict.find((b) => b.key === 'content-moderation')?.envEnabled).toBe(
      false,
    );

    const one = environmentSaysEnabled({ MODERATION_ENABLED: '1' });
    expect(one.find((b) => b.key === 'content-moderation')?.envEnabled).toBe(
      true,
    );
  });

  it.each(['1', 'true', 'YES', ' yes '])(
    'reads JAILBREAK_DETECTION_ENABLED=%j the way the classifier does',
    (value) => {
      const builtIns = environmentSaysEnabled({
        JAILBREAK_DETECTION_ENABLED: value,
      });
      expect(
        builtIns.find((b) => b.key === 'jailbreak-detection')?.envEnabled,
      ).toBe(true);
    },
  );

  it('covers exactly the built-ins the catalogue names', () => {
    // If a third built-in is added and this script is not updated, its
    // environment counterpart is not compared and the phase loses its check
    // for that one silently.
    expect(environmentSaysEnabled({}).map((b) => b.key)).toEqual([
      'content-moderation',
      'jailbreak-detection',
    ]);
  });
});

describe('disagreements', () => {
  it('is empty when the panel and the environment agree', () => {
    const builtIns = environmentSaysEnabled({ MODERATION_ENABLED: '1' });
    expect(
      disagreements(
        builtIns,
        rules({ ...BOTH_PRESENT, 'content-moderation': true }),
      ),
    ).toEqual([]);
  });

  it('flags environment-on/panel-off as the case that loses protection', () => {
    const builtIns = environmentSaysEnabled({ MODERATION_ENABLED: '1' });
    const found = disagreements(builtIns, rules(BOTH_PRESENT));

    expect(found).toHaveLength(1);
    expect(found[0].key).toBe('content-moderation');
    expect(found[0].envEnabled).toBe(true);
    expect(found[0].reconcile).toMatch(/Enable "content-moderation"/);
  });

  it('reports panel-on/environment-off as a note, not a loss', () => {
    const builtIns = environmentSaysEnabled({});
    const found = disagreements(
      builtIns,
      rules({ ...BOTH_PRESENT, 'content-moderation': true }),
    );

    expect(found).toHaveLength(1);
    // The distinction the caller keys its exit code off: this direction starts
    // enforcing something, it does not stop enforcing something.
    expect(found[0].envEnabled).toBe(false);
    expect(found[0].reconcile).toMatch(/will start enforcing/);
  });

  it('treats a missing row as not enabled, so it cannot read as agreement', () => {
    // An installation whose seed never ran has no row. With
    // MODERATION_ENABLED=1 that is the dangerous case, and it must not be
    // swallowed by `undefined === undefined`.
    const builtIns = environmentSaysEnabled({ MODERATION_ENABLED: '1' });
    const found = disagreements(builtIns, rules({}));

    expect(found.map((d) => d.key)).toContain('content-moderation');
  });
});

describe('missingRules', () => {
  it('names a built-in the database has no row for', () => {
    expect(
      missingRules(
        environmentSaysEnabled({}),
        rules({ 'content-moderation': false }),
      ),
    ).toEqual(['jailbreak-detection']);
  });

  it('is empty once the seed has run', () => {
    expect(
      missingRules(environmentSaysEnabled({}), rules(BOTH_PRESENT)),
    ).toEqual([]);
  });
});
