import type { GuardrailRule } from '../contracts/guardrail';

/**
 * Evaluating `PATTERN` rules over a piece of text.
 *
 * No I/O, no provider call: a literal search or one `RegExp` per rule. That is
 * what makes a pattern rule affordable enough to run on every turn, and it is
 * why the expensive kinds (`BUILT_IN`, `LLM_POLICY`) are separate — a caller
 * can run these unconditionally and gate the others.
 *
 * What the text is, by the time it gets here: the user's message *after*
 * Presidio masking on input, and the model's text *before* `StreamUnmasker`
 * puts personal data back on output. So `\d{11}` will not match a PESEL — by
 * then it is `<PESEL_1>`. That division of labour is deliberate and stated in
 * the rule form, because it is the kind of thing that is otherwise discovered
 * by an operator whose rule never fires.
 */

/** A half-open span `[start, end)` in the evaluated text. */
export type PatternSpan = { start: number; end: number };

export type PatternHit = {
  rule: GuardrailRule;
  spans: PatternSpan[];
};

/**
 * The placeholder a `MASK` hit leaves behind.
 *
 * Deliberately unlike Presidio's `<TYPE_n>`: `StreamUnmasker` walks the same
 * buffer looking for alias tokens, and a guardrail placeholder it mistook for
 * one would be "restored" to a value that never existed. Double square
 * brackets cannot be confused with angle brackets by either reader.
 */
export function maskPlaceholder(label: string): string {
  return `[[redacted:${label}]]`;
}

/**
 * How a masked span is labelled.
 *
 * A built-in uses its key. An operator's rule uses a slug of its name, because
 * the placeholder is read by the model — `[[redacted:credit-card]]` carries
 * information that a uuid does not. The charset is restricted so a rule name
 * cannot produce a placeholder that reads as something else, or break the
 * bracket pairing a later reader relies on.
 */
export function maskLabelFor(rule: GuardrailRule): string {
  if (rule.key) {
    return rule.key;
  }
  const slug = rule.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'rule';
}

/** Find every match of one pattern rule in `text`. */
export function evaluatePattern(
  rule: GuardrailRule,
  text: string,
): PatternSpan[] {
  const pattern = rule.pattern;
  if (!pattern) {
    return [];
  }

  return rule.patternIsRegex === true
    ? findRegexSpans(pattern, text)
    : findLiteralSpans(pattern, text);
}

function findLiteralSpans(needle: string, haystack: string): PatternSpan[] {
  const spans: PatternSpan[] = [];
  if (needle.length === 0) {
    return spans;
  }
  // Case-insensitive, because an operator writing a literal is naming a thing,
  // not a spelling. A rule that catches "Confidential" and misses
  // "CONFIDENTIAL" is a rule that looks like it works.
  const lowerNeedle = needle.toLowerCase();
  const lowerHaystack = haystack.toLowerCase();
  let from = 0;
  for (;;) {
    const at = lowerHaystack.indexOf(lowerNeedle, from);
    if (at === -1) {
      return spans;
    }
    spans.push({ start: at, end: at + needle.length });
    from = at + needle.length;
  }
}

function findRegexSpans(source: string, text: string): PatternSpan[] {
  const spans: PatternSpan[] = [];
  let regex: RegExp;
  try {
    regex = new RegExp(source, 'giu');
  } catch {
    try {
      // `u` rejects patterns that are legal without it. A rule saved before
      // this evaluator existed should still run rather than silently match
      // nothing, so the unicode flag is a preference, not a requirement.
      regex = new RegExp(source, 'gi');
    } catch {
      return spans;
    }
  }

  for (;;) {
    const match = regex.exec(text);
    if (match === null) {
      return spans;
    }
    // A zero-width match would leave lastIndex where it is and spin forever.
    if (match[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
}

/**
 * Collapse overlapping and touching spans.
 *
 * Two rules can match the same text, and one rule can match twice with an
 * overlap. Replacing them independently would either double-mask — leaving
 * `[[redacted:a]]edacted:b]]` — or shift every later offset by the length
 * difference. Merging first means one replacement per region.
 */
export function mergeSpans(spans: readonly PatternSpan[]): PatternSpan[] {
  if (spans.length === 0) {
    return [];
  }
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: PatternSpan[] = [{ ...sorted[0] }];

  for (const span of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      out.push({ ...span });
    }
  }
  return out;
}

/**
 * Replace every matched span with its placeholder.
 *
 * Right to left, so an earlier span's offsets are still valid after a later
 * one has changed the string's length.
 */
export function applyMask(text: string, hits: readonly PatternHit[]): string {
  const labelled: { span: PatternSpan; label: string }[] = [];
  for (const hit of hits) {
    const label = maskLabelFor(hit.rule);
    for (const span of hit.spans) {
      labelled.push({ span, label });
    }
  }
  if (labelled.length === 0) {
    return text;
  }

  // Merging loses which rule matched where, so a merged region takes the label
  // of the first rule that claimed any of it — sorted by start, then by the
  // order the rules were evaluated, so the result does not depend on Map
  // iteration order.
  const merged = mergeSpans(labelled.map((l) => l.span));
  const labelFor = (span: PatternSpan): string => {
    const owner = labelled.find(
      (l) => l.span.start >= span.start && l.span.end <= span.end,
    );
    return owner ? owner.label : 'rule';
  };

  let out = text;
  for (const span of [...merged].reverse()) {
    out =
      out.slice(0, span.start) +
      maskPlaceholder(labelFor(span)) +
      out.slice(span.end);
  }
  return out;
}

/**
 * The budget one turn may spend on pattern rules, in milliseconds.
 *
 * Small, because these are supposed to be microseconds each: a number this
 * size is only ever reached by a pattern that is misbehaving, and the point is
 * to stop the turn being held hostage by it rather than to ration normal work.
 */
export const DEFAULT_PATTERN_BUDGET_MS = 25;

export type PatternRunResult = {
  hits: PatternHit[];
  /** Rules not evaluated because the budget ran out before their turn. */
  skipped: GuardrailRule[];
  elapsedMs: number;
};

/**
 * Run every pattern rule, stopping when the turn's budget is gone.
 *
 * **The budget is checked between rules, never inside one.** A JavaScript
 * `RegExp` cannot be interrupted once it has entered a match, so nothing here
 * can bound a single catastrophic pattern — this bounds how many patterns run,
 * and the save-time validator is what stops a bad one being saved at all. That
 * is why the validator rejects rather than warns, and why `skipped` is
 * returned rather than swallowed: a rule that did not run is a rule that did
 * not protect anything, and the caller has to be able to say so.
 */
export function runPatternRules(
  rules: readonly GuardrailRule[],
  text: string,
  options: { budgetMs?: number; now?: () => number } = {},
): PatternRunResult {
  const budgetMs = options.budgetMs ?? DEFAULT_PATTERN_BUDGET_MS;
  const now = options.now ?? (() => Date.now());

  const started = now();
  const hits: PatternHit[] = [];
  const skipped: GuardrailRule[] = [];

  for (const rule of rules) {
    if (now() - started >= budgetMs) {
      skipped.push(rule);
      continue;
    }
    const spans = evaluatePattern(rule, text);
    if (spans.length > 0) {
      hits.push({ rule, spans });
    }
  }

  return { hits, skipped, elapsedMs: now() - started };
}
