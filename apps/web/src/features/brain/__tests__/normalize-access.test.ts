import { describe, expect, it } from 'vitest';

import { normalizeAccess, sameAccess } from '../utils/normalize-access';

const ORG = 'org-1';
const known = {
  memberIds: new Set(['u1', 'u2']),
  teamIds: new Set(['t1']),
};

describe('normalizeAccess', () => {
  it('sorts and deduplicates what it accepts', () => {
    expect(
      normalizeAccess(ORG, ['user:u2', 'team:t1', 'user:u2', 'user:u1'], known),
    ).toEqual(['team:t1', 'user:u1', 'user:u2']);
  });

  it('keeps the organization alone, since it already covers everyone', () => {
    expect(
      normalizeAccess(ORG, ['user:u1', `org:${ORG}`, 'team:t1'], known),
    ).toEqual([`org:${ORG}`]);
  });

  it('accepts an empty list — nobody yet is a legitimate answer', () => {
    expect(normalizeAccess(ORG, [], known)).toEqual([]);
  });

  it.each([
    ['another organization', 'org:org-2'],
    ['someone who is not a member', 'user:u-stranger'],
    ['a team that does not exist here', 'team:t-other'],
    ['a malformed principal', 'team :t1'],
    ['an unknown kind', 'group:t1'],
  ])('refuses the whole list for %s', (_, principal) => {
    expect(normalizeAccess(ORG, ['user:u1', principal], known)).toBeNull();
  });
});

describe('sameAccess', () => {
  it('compares as sets', () => {
    expect(sameAccess(['a', 'b'], ['b', 'a', 'a'])).toBe(true);
    expect(sameAccess(['a'], ['a', 'b'])).toBe(false);
    expect(sameAccess([], [])).toBe(true);
  });
});
