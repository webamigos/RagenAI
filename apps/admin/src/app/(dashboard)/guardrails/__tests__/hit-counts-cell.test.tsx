import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { HitCounts } from '../components/HitCounts';
import type { GuardrailHitCounts } from '../hit-window';

function render(
  counts: GuardrailHitCounts | undefined,
  enabled: boolean,
): string {
  return renderToStaticMarkup(<HitCounts counts={counts} enabled={enabled} />);
}

describe('a rule with hits', () => {
  it('names the two outcomes separately', () => {
    const markup = render({ blocked: 12, flagged: 3 }, true);

    // "What did we stop" and "what did we merely notice" are the two questions
    // an operator has about a rule set, which is why the events are two types
    // and not one. A single total would answer neither.
    expect(markup).toContain('12 blocked');
    expect(markup).toContain('3 flagged');
  });

  it('leaves out the outcome that did not happen', () => {
    const markup = render({ blocked: 0, flagged: 5 }, true);

    expect(markup).not.toContain('blocked');
    expect(markup).toContain('5 flagged');
  });

  it('still shows them when the rule has since been switched off', () => {
    const markup = render({ blocked: 4, flagged: 0 }, false);

    // A rule switched off after it fired is the most interesting row on the
    // page — somebody reacted to something. Hiding its count because of the
    // current state would erase the reason.
    expect(markup).toContain('4 blocked');
    expect(markup).toContain('Switched off since');
  });
});

describe('a rule with no hits', () => {
  it('reports zero when it is switched on, because that is a measurement', () => {
    expect(render(undefined, true)).toContain('0');
    expect(render({ blocked: 0, flagged: 0 }, true)).toContain('0');
  });

  it('reports nothing when it is switched off, because nothing was measured', () => {
    const markup = render(undefined, false);

    // Not `0`: a rule nothing evaluated did not match nothing, and the
    // difference is exactly what an operator would read the column for.
    expect(markup).not.toContain('>0<');
    expect(markup).toContain('—');
  });
});
