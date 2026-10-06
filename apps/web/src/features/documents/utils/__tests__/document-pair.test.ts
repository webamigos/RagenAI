import { describe, expect, it } from 'vitest';
import {
  orderPairIds,
  piiInconsistency,
  stricterPiiPolicy,
} from '../document-pair';

describe('orderPairIds', () => {
  it('stores the smaller id first whichever way the pair is given', () => {
    expect(orderPairIds('b-id', 'a-id')).toEqual(['a-id', 'b-id']);
    expect(orderPairIds('a-id', 'b-id')).toEqual(['a-id', 'b-id']);
  });

  it('lowercases so one pair is one row', () => {
    expect(orderPairIds('AAAA', 'bbbb')).toEqual(['aaaa', 'bbbb']);
    expect(orderPairIds('BBBB', 'aaaa')).toEqual(['aaaa', 'bbbb']);
  });

  it('refuses a file paired with itself, even in a different case', () => {
    expect(orderPairIds('abc', 'abc')).toBeNull();
    expect(orderPairIds('ABC', 'abc')).toBeNull();
  });
});

describe('stricterPiiPolicy', () => {
  it.each([
    ['NONE', 'TOXIC_ONLY', 'TOXIC_ONLY'],
    ['STRICT', 'NONE', 'STRICT'],
    ['TOXIC_ONLY', 'STRICT', 'STRICT'],
    ['STRICT', 'STRICT', 'STRICT'],
    ['NONE', 'NONE', 'NONE'],
  ] as const)('%s vs %s is %s', (a, b, expected) => {
    expect(stricterPiiPolicy(a, b)).toBe(expected);
  });
});

describe('piiInconsistency', () => {
  it('is null when both files mask the same way', () => {
    expect(piiInconsistency('STRICT', 'STRICT')).toBeNull();
  });

  it('offers to raise the weaker file to the stricter policy', () => {
    expect(piiInconsistency('TOXIC_ONLY', 'STRICT')).toEqual({
      weaker: 'first',
      raiseTo: 'STRICT',
    });
    expect(piiInconsistency('STRICT', 'NONE')).toEqual({
      weaker: 'second',
      raiseTo: 'STRICT',
    });
  });

  it('never offers a policy looser than either file has', () => {
    const policies = ['NONE', 'TOXIC_ONLY', 'STRICT'] as const;
    for (const a of policies) {
      for (const b of policies) {
        const found = piiInconsistency(a, b);
        if (found) {
          expect(found.raiseTo).toBe(stricterPiiPolicy(a, b));
        }
      }
    }
  });
});
