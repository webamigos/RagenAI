import { describe, expect, it } from 'vitest';

import { intersectPrincipals, isWidening } from '../intersect-principals';

const ORG = 'o1';

describe('intersectPrincipals', () => {
  it('keeps a principal every source shares', () => {
    expect(
      intersectPrincipals(ORG, [
        ['team:hr', 'team:board'],
        ['team:hr', 'user:u1'],
      ]),
    ).toEqual(['team:hr']);
  });

  // The case the spec names: the default must not become the union.
  it('answers nobody when the sources share no principal', () => {
    expect(intersectPrincipals(ORG, [['team:hr'], ['team:finance']])).toEqual(
      [],
    );
  });

  it('is never wider than its narrowest source', () => {
    expect(
      intersectPrincipals(ORG, [
        ['org:o1'],
        ['team:hr', 'team:board'],
        ['team:hr'],
      ]),
    ).toEqual(['team:hr']);
  });

  it('lets an organization-wide source constrain nothing', () => {
    expect(intersectPrincipals(ORG, [['org:o1'], ['team:hr']])).toEqual([
      'team:hr',
    ]);
  });

  it('is organization-wide when every source is', () => {
    expect(
      intersectPrincipals(ORG, [['org:o1'], ['org:o1', 'user:u']]),
    ).toEqual(['org:o1']);
  });

  // Membership is not known here, and guessing it would be a leak.
  it('does not assume a user belongs to a team', () => {
    expect(intersectPrincipals(ORG, [['user:u1'], ['team:hr']])).toEqual([]);
  });

  // The backfill-accessible-by state: reachable by nobody below org scope.
  it('treats a source with no principals as readable by nobody', () => {
    expect(intersectPrincipals(ORG, [['team:hr'], []])).toEqual([]);
  });

  // A result nobody here matches must be empty, or publication and export
  // are unblocked for a page no reader can see.
  it('answers nobody for a source reachable only by another organization', () => {
    expect(intersectPrincipals(ORG, [['org:o2']])).toEqual([]);
    expect(
      intersectPrincipals(ORG, [['org:o2', 'user:u1'], ['user:u1']]),
    ).toEqual(['user:u1']);
  });

  it('does not read another organization as everyone', () => {
    expect(intersectPrincipals(ORG, [['org:o2'], ['team:hr']])).toEqual([]);
  });

  it('drops a string that is not a principal', () => {
    expect(
      intersectPrincipals(ORG, [
        ['team:hr', 'group:hr'],
        ['team:hr', 'group:hr'],
      ]),
    ).toEqual(['team:hr']);
  });

  it('answers nobody for a page with no sources', () => {
    expect(intersectPrincipals(ORG, [])).toEqual([]);
  });

  it('returns a stable order', () => {
    expect(
      intersectPrincipals(ORG, [
        ['user:b', 'user:a'],
        ['user:a', 'user:b'],
      ]),
    ).toEqual(['user:a', 'user:b']);
  });
});

describe('isWidening', () => {
  it('is a widening when any reader is added, even if others go', () => {
    expect(isWidening(ORG, ['team:hr'], ['team:board'])).toBe(true);
  });

  it('is not a widening when readers are only removed', () => {
    expect(isWidening(ORG, ['team:hr', 'team:board'], ['team:hr'])).toBe(false);
  });

  it('is a widening to go organization-wide', () => {
    expect(isWidening(ORG, ['team:hr'], ['org:o1'])).toBe(true);
  });

  it('is never a widening from organization-wide', () => {
    expect(isWidening(ORG, ['org:o1'], ['team:hr', 'user:u'])).toBe(false);
  });

  it('is a widening from nobody to anybody', () => {
    expect(isWidening(ORG, [], ['team:hr'])).toBe(true);
  });
});
