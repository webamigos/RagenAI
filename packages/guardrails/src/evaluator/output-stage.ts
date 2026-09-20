import { OUTPUT_WINDOW_CHARS } from '../contracts/guardrail';
import type { ResolvedGuardrail } from '../resolver/resolve';
import { applyMask, runPatternRules, type PatternHit } from './pattern';

/**
 * The output stage for `PATTERN` rules: one sliding window, both runtimes.
 *
 * The input stage reads a whole message. An answer arrives in pieces, so a
 * rule evaluated per delta misses every match that straddles a chunk boundary
 * — and which matches those are depends on how the provider happened to split
 * the text, which is to say it is not a property of the rule at all. So the
 * text is held back by {@link OUTPUT_WINDOW_CHARS} characters: anything older
 * than the window has been seen with that much following context and is
 * released, anything newer stays until it has been.
 *
 * **The window is a bound the pattern has to fit inside**, not a best effort.
 * A rule whose match can run past it would have its prefix released before the
 * match completed, and `BLOCK` or `MASK` would then not fire at all — a
 * guardrail that reads as enabled on the page and is enforced by nothing.
 * `validatePatternShape` refuses such a pattern at save time and names the
 * window in the refusal; this file is the other half of that contract and the
 * two share the constant.
 *
 * ## Why a transducer and not an async generator
 *
 * Nothing here does I/O — a literal search or one `RegExp` per rule, exactly
 * as on input — so `push` is synchronous and returns what may be released.
 * That matters for ordering: an answer's stream carries tool calls and
 * reasoning beside its text, and a generator that owned the iteration would
 * have to decide what happens to a tool-call part that arrives while text is
 * held. It would emit it early, ahead of text the reader has not been shown
 * yet, and the reordering would be invisible until someone read a transcript.
 * The caller owns the stream, holds the non-text parts against the same
 * boundary, and this owns the window.
 *
 * `LLM_POLICY` on output is a different problem — a judge needs the finished
 * answer, so there is no window to slide — and it is Phase D3, not this file.
 */

export type OutputStageEvent =
  | { readonly type: 'text'; readonly text: string }
  /**
   * A `BLOCK` rule matched. The caller stops the stream, tells the reader, and
   * persists a refusal rather than the text it withheld.
   */
  | { readonly type: 'blocked'; readonly rule: ResolvedGuardrail };

export type OutputStageDeps = {
  /**
   * Fire-and-forget, once per rule that fired, at the end of the turn.
   *
   * Once per rule and not once per release: the window releases text many
   * times over one answer, and a rule that matched in three of them is one
   * rule firing. Recording per release would make the guardrails page's hit
   * counts a function of how the provider chunked the response.
   */
  readonly record: (hit: {
    rule: ResolvedGuardrail;
    matchCount?: number;
  }) => void;
  /**
   * Some rules did not run because a release's budget was gone.
   *
   * Reported for the same reason the input stage reports it — a rule that did
   * not run protected nothing — and **once per rule per turn**, because this
   * one runs on every delta and an unreported rule is no worse the fiftieth
   * time than the first, while fifty log lines during an incident are.
   */
  readonly onBudgetExhausted: (
    skipped: readonly ResolvedGuardrail[],
    elapsedMs: number,
  ) => void;
};

export type OutputStageOptions = {
  /**
   * The window, in characters. Defaults to {@link OUTPUT_WINDOW_CHARS}.
   *
   * Exposed for tests, which would otherwise have to feed 256 characters of
   * filler to observe a boundary and would be asserting the filler.
   */
  readonly windowChars?: number;
  /** The per-release pattern budget. See {@link createOutputStage}. */
  readonly budgetMs?: number;
  /** The clock, for the same reason the input stage exposes one. */
  readonly now?: () => number;
};

export type OutputStage = {
  /** Feed one text delta. Returns what may be released, in order. */
  push: (delta: string) => OutputStageEvent[];
  /**
   * The stream ended. Releases whatever is still held, evaluated with no
   * window — there is no more context coming, so nothing is pending.
   */
  flush: () => OutputStageEvent[];
  /**
   * How much text is currently held back.
   *
   * The caller needs it to hold non-text parts against the same boundary, and
   * a test needs it to say the window is doing anything at all.
   */
  readonly held: number;
};

/**
 * Build the window for one turn.
 *
 * The budget is **per release**, not per turn, and that is the opposite of the
 * input stage's choice for a reason. A turn's budget spent over a stream would
 * leave the tail of a long answer unevaluated — the rules would stop applying
 * partway through, silently, and the longer the answer the more of it went
 * unchecked. Bounding each release instead keeps every delta covered and keeps
 * the work bounded too: the buffer this scans is the window plus one delta, so
 * the cost of a release does not grow with the length of the answer.
 */
export function createOutputStage(
  rules: readonly ResolvedGuardrail[],
  deps: OutputStageDeps,
  options: OutputStageOptions = {},
): OutputStage {
  const patternRules = rules.filter((rule) => rule.kind === 'PATTERN');
  const windowChars = options.windowChars ?? OUTPUT_WINDOW_CHARS;

  const patternOptions: { budgetMs?: number; now?: () => number } = {};
  if (options.budgetMs !== undefined) {
    patternOptions.budgetMs = options.budgetMs;
  }
  if (options.now !== undefined) {
    patternOptions.now = options.now;
  }

  // The evaluator works in `GuardrailRule`, which is what a pattern needs;
  // everything a caller records wants the resolved rule, sources and all. Same
  // lookup as the input stage, for the same reason: a cast would also silently
  // accept a rule that never came from this set.
  const byId = new Map(patternRules.map((rule) => [rule.publicId, rule]));
  const resolve = (rule: { publicId: string }): ResolvedGuardrail => {
    const found = byId.get(rule.publicId);
    if (!found) {
      throw new Error(
        `Guardrail ${rule.publicId} came back from the evaluator but is not in the resolved set`,
      );
    }
    return found;
  };

  let buffer = '';
  let blocked = false;
  /** Spans finalized so far, per rule, for the single event each one gets. */
  const matchesByRule = new Map<
    string,
    { rule: ResolvedGuardrail; matchCount: number }
  >();
  const budgetReported = new Set<string>();

  const stage = {
    push(delta: string): OutputStageEvent[] {
      if (blocked || patternRules.length === 0) {
        return blocked ? [] : [{ type: 'text', text: delta }];
      }
      buffer += delta;
      return release(false);
    },

    flush(): OutputStageEvent[] {
      if (blocked) {
        return [];
      }
      if (patternRules.length === 0) {
        return [];
      }
      const events = release(true);
      // Every rule that fired gets its event here, including on a turn that
      // ended in a block: a `MASK` that was applied and a `LOG` that matched
      // both happened, and dropping them would make the hit counts describe
      // only the turns nobody blocked.
      recordAll();
      return events;
    },

    get held(): number {
      return buffer.length;
    },
  };

  return stage;

  function release(final: boolean): OutputStageEvent[] {
    const { hits, skipped, elapsedMs } = runPatternRules(
      patternRules,
      buffer,
      patternOptions,
    );

    if (skipped.length > 0) {
      const unreported = skipped.filter(
        (rule) => !budgetReported.has(rule.publicId),
      );
      if (unreported.length > 0) {
        for (const rule of unreported) {
          budgetReported.add(rule.publicId);
        }
        deps.onBudgetExhausted(unreported.map(resolve), elapsedMs);
      }
    }

    // A `BLOCK` match ends the turn as soon as it is seen, pending or not.
    // Waiting for it to finalize would release more of the text the rule
    // exists to withhold, and a match that might have grown longer is a match
    // either way.
    const blocking = hits.find((hit) => hit.rule.action === 'BLOCK');
    if (blocking) {
      blocked = true;
      buffer = '';
      const rule = resolve(blocking.rule);
      // The rules that matched *this* pass are counted before the turn ends,
      // and not only the ones a previous release finalized. Their spans are
      // still in the buffer, so no pass has counted them and none will — and
      // a `LOG` rule that matched the same delta as the block is a rule that
      // fired on what the model produced, whether or not the reader saw it.
      //
      // The input stage drops the equivalent hits, and the asymmetry is
      // deliberate: there it returns early to avoid paying for the expensive
      // kinds, and there is nothing to save by returning early here.
      for (const hit of hits) {
        if (hit.rule.action !== 'BLOCK') {
          count(hit.rule, hit.spans.length);
        }
      }
      recordAll();
      deps.record({ rule });
      return [{ type: 'blocked', rule }];
    }

    const boundary = final
      ? buffer.length
      : wholeCodePoint(
          buffer,
          releaseBoundary(buffer.length, hits, windowChars),
        );

    const finalized: PatternHit[] = [];
    for (const hit of hits) {
      const spans = hit.spans.filter((span) => span.end <= boundary);
      if (spans.length > 0) {
        finalized.push({ rule: hit.rule, spans });
        count(hit.rule, spans.length);
      }
    }

    const text = applyMask(
      buffer.slice(0, boundary),
      finalized.filter((hit) => hit.rule.action === 'MASK'),
    );
    buffer = buffer.slice(boundary);

    return text.length > 0 ? [{ type: 'text', text }] : [];
  }

  function count(rule: { publicId: string }, spans: number): void {
    const seen = matchesByRule.get(rule.publicId);
    if (seen) {
      seen.matchCount += spans;
      return;
    }
    matchesByRule.set(rule.publicId, {
      rule: resolve(rule),
      matchCount: spans,
    });
  }

  function recordAll(): void {
    for (const { rule, matchCount } of matchesByRule.values()) {
      deps.record({ rule, matchCount });
    }
    matchesByRule.clear();
  }
}

/**
 * How much of the buffer may be released.
 *
 * Two constraints, and the boundary is the tighter of them. The window is the
 * first: the last `windowChars` characters have not been seen with enough
 * following context to know whether a match starts in them. The second is a
 * match that reaches into that tail — releasing its prefix would mean masking
 * half of it later, or blocking after part of it had already been shown — so
 * the boundary pulls back to where such a match begins.
 *
 * Exported because it is the whole of the window's behaviour and it is worth
 * being able to state it in a test directly, rather than only through the
 * stream that uses it.
 */
/**
 * Pull a boundary back off the seam of a surrogate pair.
 *
 * `String.prototype.slice` counts UTF-16 code units, and an emoji is two of
 * them. A boundary landing between the halves releases a lone high surrogate
 * and holds its partner, so the reader is shown a replacement character and
 * the next delta opens with a second one — for text that was never matched by
 * anything. Concatenated they would still be one emoji, which is why nothing
 * downstream notices: the damage is done by the split itself, in the delta
 * that goes out over SSE.
 *
 * Off by one code unit, so a pair is always released whole. It never moves the
 * boundary forward, which would release a character the window is holding for
 * a reason.
 */
export function wholeCodePoint(text: string, boundary: number): number {
  if (boundary <= 0 || boundary >= text.length) {
    return boundary;
  }
  const previous = text.charCodeAt(boundary - 1);
  const isHighSurrogate = previous >= 0xd800 && previous <= 0xdbff;
  return isHighSurrogate ? boundary - 1 : boundary;
}

export function releaseBoundary(
  length: number,
  hits: readonly PatternHit[],
  windowChars: number,
): number {
  const safe = Math.max(0, length - windowChars);
  let boundary = safe;

  for (const hit of hits) {
    for (const span of hit.spans) {
      if (span.end > safe && span.start < boundary) {
        boundary = span.start;
      }
    }
  }

  return boundary;
}
