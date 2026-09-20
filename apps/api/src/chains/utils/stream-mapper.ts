import type { OutputGuard, OutputTextResult } from '@ragenai/guardrails';

import { GuardrailError } from '../errors.js';
import type { ChainStreamPart } from '../types/common.js';

/**
 * Strip LiteLLM's `__thought__<base64>` suffix from tool call IDs.
 * LiteLLM embeds Claude's extended thinking content into tool call IDs when
 * proxying through the OpenAI-compatible API (which has no native thinking field).
 * We strip it here for clean logging/SSE — the AI SDK's internal tool matching
 * uses the original IDs and is unaffected.
 */
function cleanToolCallId(id: string): string {
  const idx = id.indexOf('__thought__');
  return idx !== -1 ? id.slice(0, idx) : id;
}

/**
 * Maps the Vercel AI SDK's fullStream to our simplified ChainStreamPart type.
 * Passes through text-delta, reasoning, and tool events.
 *
 * Note: AI SDK v6 uses `input`/`output` instead of `args`/`result` for tool parts.
 *
 * ## The output guardrail window
 *
 * With an `outputStage`, every text delta goes through it before it is
 * emitted: matched spans are masked, and a `BLOCK` rule ends the stream with a
 * `guardrail-violation` part. The window is **inside** this function on
 * purpose. `StreamUnmasker` buffers outside it, walking the same text for PII
 * alias tokens, and two buffering layers whose order is decided by whoever
 * wired them up last is how `[[redacted:…]]` and `<PESEL_1>` come to be
 * restored in the wrong order. One layer in here, one out there, fixed.
 *
 * Without one, the returned iterator is the same shape it has always been and
 * costs nothing: an organization with no output rules is not buffered.
 *
 * Two modes, picked before the first token. `window` releases text as it goes,
 * holding the last few hundred characters so a match spanning a delta is still
 * caught. `buffered` releases nothing until the answer is finished, because a
 * judged rule scores the whole answer and there is no verdict to act on before
 * the last token — the rule form says so next to the toggle. A turn cannot
 * change its mind halfway: by then it would have streamed half an answer.
 */
export async function* mapFullStream(
  sdkStream: AsyncIterable<any>,
  guard?: OutputGuard,
): AsyncIterable<ChainStreamPart> {
  if (guard?.mode === 'buffered') {
    yield* bufferedAnswer(sdkStream, guard.evaluate);
    return;
  }

  const outputStage = guard?.stage;
  /**
   * Non-text parts that arrived while text was held back, with the position
   * they arrived at.
   *
   * A tool call emitted straight away would reach the reader ahead of the text
   * that preceded it, because that text is still inside the window. So each
   * one records how much text had been pushed when it arrived, and waits until
   * at least that much has been *released*. Counting a part as releasable
   * because some text went out is not the same test and was the first version
   * of this: a partial release let a tool call past text it came after.
   *
   * What remains is that a part trails text that arrived *after* it, when both
   * leave in one release. Splitting the released chunk at the part's position
   * would fix that and cannot be done honestly — a `MASK` rule changes the
   * text's length, so a position in what went in does not locate a point in
   * what comes out. So: never early, and at most one release late.
   */
  const queued: { at: number; part: ChainStreamPart }[] = [];
  /** Characters handed to the window so far. The queue's positions are in these. */
  let consumed = 0;

  for await (const part of sdkStream) {
    switch (part.type) {
      case 'text-delta': {
        if (!outputStage) {
          yield { type: 'text-delta', textDelta: part.text };
          break;
        }
        consumed += part.text.length;
        for (const event of outputStage.push(part.text)) {
          if (event.type === 'blocked') {
            // Everything queued behind the window goes with the text it was
            // waiting on. The turn is refused; there is no partial answer to
            // decorate with the tool calls that produced it.
            queued.length = 0;
            yield {
              type: 'guardrail-violation',
              guardrailPublicId: event.rule.publicId,
              guardrailName: event.rule.key ?? event.rule.name,
            };
            return;
          }
          yield { type: 'text-delta', textDelta: event.text };
        }
        yield* drain();
        break;
      }
      case 'reasoning-start':
        yield* hold({ type: 'reasoning-start', id: part.id });
        break;
      case 'reasoning-delta':
        // Reasoning is not the answer and is not evaluated: an output rule
        // reads what the reader is shown. It is held only so it keeps its
        // place relative to the text around it.
        yield* hold({ type: 'reasoning-delta', id: part.id, delta: part.text });
        break;
      case 'reasoning-end':
        yield* hold({ type: 'reasoning-end', id: part.id });
        break;
      case 'tool-call':
        yield* hold({
          type: 'tool-call',
          toolCallId: cleanToolCallId(part.toolCallId),
          toolName: part.toolName,
          args: part.input ?? part.args,
        });
        break;
      case 'tool-result':
        yield* hold({
          type: 'tool-result',
          toolCallId: cleanToolCallId(part.toolCallId),
          toolName: part.toolName,
          result: part.output !== undefined ? part.output : part.result,
        });
        break;
      case 'tool-approval-request': {
        // AI SDK v6 emits this when a tool's `needsApproval` predicate
        // returns true. The shape has the full typed tool call nested
        // under `toolCall`; we flatten it into our ChainStreamPart.
        const toolCall = part.toolCall ?? {};
        yield* hold({
          type: 'tool-approval-request',
          approvalId: part.approvalId,
          toolCallId: cleanToolCallId(toolCall.toolCallId ?? ''),
          toolName: toolCall.toolName ?? 'unknown',
          args: toolCall.input ?? toolCall.args,
        });
        break;
      }
      // Ignore other event types (source, finish, finish-step, etc.)
    }
  }

  if (outputStage) {
    for (const event of outputStage.flush()) {
      if (event.type === 'blocked') {
        queued.length = 0;
        yield {
          type: 'guardrail-violation',
          guardrailPublicId: event.rule.publicId,
          guardrailName: event.rule.key ?? event.rule.name,
        };
        return;
      }
      yield { type: 'text-delta', textDelta: event.text };
    }
    // Everything the window had is out, so every position is reached.
    yield* drain();
  }

  /** Emit a non-text part, or queue it behind the text it came after. */
  function* hold(part: ChainStreamPart): Generator<ChainStreamPart> {
    if (!outputStage || outputStage.held === 0) {
      yield part;
      return;
    }
    queued.push({ at: consumed, part });
  }

  function* drain(): Generator<ChainStreamPart> {
    if (!outputStage) {
      return;
    }
    const released = consumed - outputStage.held;
    while (queued.length > 0 && (queued[0] as { at: number }).at <= released) {
      yield (queued.shift() as { part: ChainStreamPart }).part;
    }
  }
}

/**
 * The text of a mapped stream, for a caller that wants strings.
 *
 * `textStream` used to be the AI SDK's own, which meant it never met the
 * output window: an organization's rule applied to the surfaces that read
 * `fullStream` and to no other, and nothing anywhere said so. It is derived
 * from the mapped stream now, so a surface is covered by which function it
 * calls rather than by somebody remembering.
 *
 * **The two share one iterator**, so a caller consumes one of them, not both.
 * That is what makes the window single: two would each hold their own buffer
 * and each file its own hit for the same answer.
 *
 * A block throws rather than ending the stream quietly. A string iterator has
 * nowhere to put "and the reason it stopped is a rule", and a caller that
 * treated the end as the end of the answer would persist the text it had — the
 * one outcome the rule exists to prevent. An exception cannot be ignored by
 * accident.
 */
export async function* textOfStream(
  parts: AsyncIterable<ChainStreamPart>,
): AsyncIterable<string> {
  for await (const part of parts) {
    if (part.type === 'guardrail-violation') {
      throw new GuardrailError(
        part.guardrailPublicId,
        part.guardrailName,
        'The answer was refused by a guardrail',
      );
    }
    if (part.type === 'text-delta') {
      yield part.textDelta;
    }
  }
}

/**
 * The buffered mode: nothing is released until the answer is finished.
 *
 * A judged output rule scores the whole answer, so there is no verdict to act
 * on before the last token — and once the whole answer is in hand there is
 * nothing left for a window to do either, so the patterns run over it in the
 * same pass.
 *
 * Parts that are not text pass straight through as they arrive rather than
 * queueing. In the window's mode they queue because text is leaving around
 * them and the order matters; here *no* text leaves until the end, so a tool
 * call held back would only arrive later for no reason. The reader sees the
 * turn's tool calls, then the answer, which is the truthful account of a turn
 * whose answer could not be shown until it was complete.
 */
async function* bufferedAnswer(
  sdkStream: AsyncIterable<any>,
  evaluate: (text: string) => Promise<OutputTextResult>,
): AsyncIterable<ChainStreamPart> {
  let answer = '';

  for await (const part of sdkStream) {
    switch (part.type) {
      case 'text-delta':
        answer += part.text;
        break;
      case 'reasoning-start':
        yield { type: 'reasoning-start', id: part.id };
        break;
      case 'reasoning-delta':
        yield { type: 'reasoning-delta', id: part.id, delta: part.text };
        break;
      case 'reasoning-end':
        yield { type: 'reasoning-end', id: part.id };
        break;
      case 'tool-call':
        yield {
          type: 'tool-call',
          toolCallId: cleanToolCallId(part.toolCallId),
          toolName: part.toolName,
          args: part.input ?? part.args,
        };
        break;
      case 'tool-result':
        yield {
          type: 'tool-result',
          toolCallId: cleanToolCallId(part.toolCallId),
          toolName: part.toolName,
          result: part.output !== undefined ? part.output : part.result,
        };
        break;
      case 'tool-approval-request': {
        const toolCall = part.toolCall ?? {};
        yield {
          type: 'tool-approval-request',
          approvalId: part.approvalId,
          toolCallId: cleanToolCallId(toolCall.toolCallId ?? ''),
          toolName: toolCall.toolName ?? 'unknown',
          args: toolCall.input ?? toolCall.args,
        };
        break;
      }
      // Ignore other event types (source, finish, finish-step, etc.)
    }
  }

  const verdict = await evaluate(answer);

  if (verdict.blockedBy) {
    yield {
      type: 'guardrail-violation',
      guardrailPublicId: verdict.blockedBy.publicId,
      guardrailName: verdict.blockedBy.key ?? verdict.blockedBy.name,
    };
    return;
  }

  // One delta, because that is what happened: the answer arrived at once.
  // Splitting it back into the provider's chunks would only pretend otherwise,
  // and every consumer already accumulates deltas into one string.
  if (verdict.text.length > 0) {
    yield { type: 'text-delta', textDelta: verdict.text };
  }
}
