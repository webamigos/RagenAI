/**
 * A relation's kind as the reader's language says it.
 *
 * The kind is free text written by the extraction model — "a short verb
 * phrase", with English examples in its prompt (packages/brain-core's
 * extraction prompt) — so most kinds are those examples verbatim, and a Polish
 * panel showed "applies to" between two Polish titles. The phrases the prompt
 * seeds, and a few it is known to produce beside them, are translated; any
 * other kind is shown as written, which for a Polish document is usually
 * already Polish.
 *
 * Keys are message keys under `brain.relation-kind`.
 */
const KNOWN_KINDS: Record<string, string> = {
  approves: 'approves',
  owns: 'owns',
  'is responsible for': 'is-responsible-for',
  'responsible for': 'is-responsible-for',
  'applies to': 'applies-to',
  includes: 'includes',
  costs: 'costs',
  requires: 'requires',
  precedes: 'precedes',
  produces: 'produces',
  governs: 'governs',
  'is part of': 'is-part-of',
  'part of': 'is-part-of',
  references: 'references',
  'depends on': 'depends-on',
};

export const RELATION_KIND_KEYS = [...new Set(Object.values(KNOWN_KINDS))];

/** The message key for a kind, or null when it is not one the panel translates. */
export function relationKindKey(kind: string): string | null {
  const normalised = kind.trim().toLowerCase().replace(/\s+/g, ' ');
  return KNOWN_KINDS[normalised] ?? null;
}

/**
 * The kind to show: translated when known, as written otherwise. `t` is a
 * translator for the `brain` namespace.
 */
export function relationKindLabel(
  kind: string,
  t: (key: `relation-kind.${string}`) => string,
): string {
  const key = relationKindKey(kind);
  return key ? t(`relation-kind.${key}`) : kind;
}
