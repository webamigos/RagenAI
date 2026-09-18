import { describe, expect, it } from 'vitest';

import { isOnPremise } from '../deployment';

describe('isOnPremise', () => {
  it.each(['1', 'true', 'yes', 'on'])('accepts %s', (value) => {
    expect(isOnPremise({ IS_ON_PREMISE: value })).toBe(true);
  });

  it.each(['TRUE', 'True', 'YES', 'On'])(
    'accepts %s regardless of case',
    (value) => {
      expect(isOnPremise({ IS_ON_PREMISE: value })).toBe(true);
    },
  );

  it('accepts a value with stray whitespace, which a compose file produces', () => {
    expect(isOnPremise({ IS_ON_PREMISE: ' true ' })).toBe(true);
  });

  it.each(['0', 'false', 'no', 'off'])('refuses %s', (value) => {
    // The reading this replaces treated every one of these as on-premise,
    // because it asked `!process.env.IS_ON_PREMISE` and any non-empty string
    // is truthy. `IS_ON_PREMISE=0` meant on-premise, which is the opposite of
    // what anybody writing `0` intends.
    expect(isOnPremise({ IS_ON_PREMISE: value })).toBe(false);
  });

  it.each([undefined, '', '   '])('treats %p as unset', (value) => {
    // A variable someone cleared in a dashboard, or a bare `IS_ON_PREMISE=`
    // line in a compose file, is a real deploy shape and has to mean unset.
    expect(isOnPremise({ IS_ON_PREMISE: value })).toBe(false);
  });

  it('refuses a value it does not recognise rather than guessing', () => {
    expect(isOnPremise({ IS_ON_PREMISE: 'onprem' })).toBe(false);
    expect(isOnPremise({ IS_ON_PREMISE: 'enabled' })).toBe(false);
  });

  it('defaults to SaaS when nothing is set at all', () => {
    // Which is every installation `create-ragen-app` produces today: nothing
    // in the repository sets this variable, so the per-organization moderation
    // toggle is ignored in exactly the deployments the distinction exists for.
    // Recorded here rather than fixed, because it is a product decision.
    expect(isOnPremise({})).toBe(false);
  });

  it('answers the same for the two spellings that used to disagree', () => {
    // The regression. The chains asked `!process.env.IS_ON_PREMISE` and the
    // settings page asked `=== '1'`, so `true` gave an installation where the
    // per-organization toggle worked and the page said it did not.
    for (const value of ['1', 'true', '0', 'false', undefined]) {
      const answer = isOnPremise({ IS_ON_PREMISE: value });
      expect(typeof answer).toBe('boolean');
    }

    expect(isOnPremise({ IS_ON_PREMISE: 'true' })).toBe(
      isOnPremise({ IS_ON_PREMISE: '1' }),
    );
    expect(isOnPremise({ IS_ON_PREMISE: '0' })).toBe(isOnPremise({}));
  });
});
