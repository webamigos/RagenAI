/**
 * The pure half of document language pairs (ADR-54): how a pair is
 * represented and how two PII policies compare. No database, no session, so
 * the same rules are importable from a component and from a command.
 */

export type PairPiiPolicy = 'NONE' | 'TOXIC_ONLY' | 'STRICT';

/**
 * Permissiveness order, loosest first. `PiiPolicy` is declared in this order
 * in the schema but nothing compares two values, so the order is written down
 * here once. A higher number masks more.
 */
const STRICTNESS: Record<PairPiiPolicy, number> = {
  NONE: 0,
  TOXIC_ONLY: 1,
  STRICT: 2,
};

/**
 * The two ids in the order a pair is stored: the smaller first. The migration
 * holds a CHECK on it, so a pair has one representation and cannot be written
 * as both A→B and B→A. Ids are lowercase UUIDs, whose string order is the
 * order Postgres gives the `uuid` type.
 */
export function orderPairIds(
  first: string,
  second: string,
): [string, string] | null {
  const a = first.toLowerCase();
  const b = second.toLowerCase();
  if (a === b) {
    return null;
  }
  return a < b ? [a, b] : [b, a];
}

/** The stricter of two policies. Equal policies return themselves. */
export function stricterPiiPolicy(
  first: PairPiiPolicy,
  second: PairPiiPolicy,
): PairPiiPolicy {
  return STRICTNESS[first] >= STRICTNESS[second] ? first : second;
}

export type PiiInconsistency = {
  /** Which file's policy is weaker, and so the one a person may raise. */
  weaker: 'first' | 'second';
  /** The policy to raise it to: the stricter of the two, never a lower one. */
  raiseTo: PairPiiPolicy;
};

/**
 * Whether two paired files mask differently, and the one change that would
 * make them agree. The only offer is to **raise** the weaker file: a pair
 * never lowers a policy, and nothing here changes one — the caller shows this
 * and a person clicks.
 */
export function piiInconsistency(
  first: PairPiiPolicy,
  second: PairPiiPolicy,
): PiiInconsistency | null {
  if (STRICTNESS[first] === STRICTNESS[second]) {
    return null;
  }
  return {
    weaker: STRICTNESS[first] < STRICTNESS[second] ? 'first' : 'second',
    raiseTo: stricterPiiPolicy(first, second),
  };
}
