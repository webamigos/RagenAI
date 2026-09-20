import { describe, expect, it } from 'vitest';

import { OUTPUT_GUARDRAIL_REFUSAL } from '../constants';
import { answerToPersist } from '../utils/answer-to-persist';

/**
 * The one decision Phase D exists to get right, in the one place it is made.
 *
 * It lived inside `assistant-stream.ts`, a 1200-line generator with no test
 * harness, which is why it is a function now: "the refusal is stored, never
 * the withheld text" is not a claim a comment can hold, and the failure it
 * describes — a thread row containing the text a rule stopped — is invisible
 * until somebody reads that row.
 */

const WITHHELD = 'the key is hunter2 and the door code is 4711';

const blocked = { guardrail: 'rule-9', rule: 'No secrets' };

describe('answerToPersist', () => {
  it('stores the refusal and none of the withheld answer', () => {
    const persisted = answerToPersist({
      fullMessage: WITHHELD,
      blocked,
      reasoningContent: '',
      reasoningEffort: null,
      model: 'gemini-3-flash-preview',
    });

    expect(persisted.content).toBe(OUTPUT_GUARDRAIL_REFUSAL);
    expect(persisted.content).not.toContain('hunter2');
    // Not appended to the refusal either: a reader shown the answer *and*
    // told it was withheld has still been shown the answer.
    expect(persisted.content).not.toContain(WITHHELD);
  });

  it('drops the reasoning with it', () => {
    // A model's reasoning paraphrases what it was about to say, and the panel
    // renders it in a collapsible block — so keeping it past a block leaks the
    // same content through a different field.
    const persisted = answerToPersist({
      fullMessage: WITHHELD,
      blocked,
      reasoningContent: 'First I will state the key, hunter2, and then…',
      reasoningEffort: 'medium',
      model: null,
    });

    expect(JSON.stringify(persisted)).not.toContain('hunter2');
    expect(persisted.metadata?.reasoningContent).toBeUndefined();
  });

  it('marks the message so the panel can localize it', () => {
    const persisted = answerToPersist({
      fullMessage: WITHHELD,
      blocked,
      reasoningContent: '',
      reasoningEffort: null,
      model: 'gpt-5.4',
    });

    expect(persisted.metadata?.guardrailBlocked).toEqual(blocked);
    expect(persisted.metadata?.model).toBe('gpt-5.4');
  });

  it('is the answer itself on an ordinary turn', () => {
    const persisted = answerToPersist({
      fullMessage: 'Warsaw is the capital of Poland.',
      blocked: null,
      reasoningContent: '',
      reasoningEffort: null,
      model: 'gpt-5.4',
    });

    expect(persisted.content).toBe('Warsaw is the capital of Poland.');
    // No metadata at all when there is nothing to say: the column was
    // `undefined` for a plain answer before this function existed, and a row
    // that suddenly carries `{ model }` is a change nobody asked for here.
    expect(persisted.metadata).toBeUndefined();
  });

  it('keeps the reasoning of an ordinary turn, and what produced it', () => {
    const persisted = answerToPersist({
      fullMessage: 'Warsaw.',
      blocked: null,
      reasoningContent: 'The question asks for a capital city.',
      reasoningEffort: 'medium',
      model: 'gpt-5.4',
    });

    expect(persisted.metadata).toEqual({
      reasoningContent: 'The question asks for a capital city.',
      reasoningEffort: 'medium',
      model: 'gpt-5.4',
    });
  });
});
