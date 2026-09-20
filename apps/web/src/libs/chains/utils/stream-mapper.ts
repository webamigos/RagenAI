import type { OutputStage } from '@ragenai/guardrails';

import type { ChainStreamPart } from '../types/common';

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
 */
export async function* mapFullStream(
  sdkStream: AsyncIterable<any>,
  outputStage?: OutputStage,
): AsyncIterable<ChainStreamPart> {
  /**
   * Non-text parts that arrived while text was held back.
   *
   * A tool call emitted straight away would reach the reader ahead of the text
   * that preceded it, because that text is still inside the window. So they
   * queue behind it and are released with it. A part can therefore be up to
   * one release late and is never early, which is the direction that keeps a
   * transcript readable.
   */
  const queued: ChainStreamPart[] = [];

  for await (const part of sdkStream) {
    switch (part.type) {
      case 'text-delta': {
        if (!outputStage) {
          yield { type: 'text-delta', textDelta: part.text };
          break;
        }
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
          yield* drain(queued);
        }
        break;
      }
      case 'reasoning-start':
        yield* hold(
          queued,
          { type: 'reasoning-start', id: part.id },
          outputStage,
        );
        break;
      case 'reasoning-delta':
        // Reasoning is not the answer and is not evaluated: an output rule
        // reads what the reader is shown. It is held only so it keeps its
        // place relative to the text around it.
        yield* hold(
          queued,
          { type: 'reasoning-delta', id: part.id, delta: part.text },
          outputStage,
        );
        break;
      case 'reasoning-end':
        yield* hold(
          queued,
          { type: 'reasoning-end', id: part.id },
          outputStage,
        );
        break;
      case 'tool-call':
        yield* hold(
          queued,
          {
            type: 'tool-call',
            toolCallId: cleanToolCallId(part.toolCallId),
            toolName: part.toolName,
            args: part.input ?? part.args,
          },
          outputStage,
        );
        break;
      case 'tool-result':
        yield* hold(
          queued,
          {
            type: 'tool-result',
            toolCallId: cleanToolCallId(part.toolCallId),
            toolName: part.toolName,
            result: part.output !== undefined ? part.output : part.result,
          },
          outputStage,
        );
        break;
      case 'tool-approval-request': {
        // AI SDK v6 emits this when a tool's `needsApproval` predicate
        // returns true. The shape has the full typed tool call nested
        // under `toolCall`; we flatten it into our ChainStreamPart.
        const toolCall = part.toolCall ?? {};
        yield* hold(
          queued,
          {
            type: 'tool-approval-request',
            approvalId: part.approvalId,
            toolCallId: cleanToolCallId(toolCall.toolCallId ?? ''),
            toolName: toolCall.toolName ?? 'unknown',
            args: toolCall.input ?? toolCall.args,
          },
          outputStage,
        );
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
    yield* drain(queued);
  }
}

/**
 * Emit a non-text part, or queue it while the window is holding text.
 *
 * Checked per part rather than once per turn: an answer holds text only while
 * the window has something in it, so a tool call arriving before the first
 * delta — or after the last one has been released — is not delayed at all.
 */
function* hold(
  queued: ChainStreamPart[],
  part: ChainStreamPart,
  outputStage: OutputStage | undefined,
): Generator<ChainStreamPart> {
  if (outputStage && outputStage.held > 0) {
    queued.push(part);
    return;
  }
  yield part;
}

function* drain(queued: ChainStreamPart[]): Generator<ChainStreamPart> {
  while (queued.length > 0) {
    yield queued.shift() as ChainStreamPart;
  }
}
