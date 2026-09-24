import { describe, it, expect } from 'vitest';

import {
  buildPiiSystemInstruction,
  withPiiSystemInstruction,
} from '../pii-system-instruction';
import { buildRagMessages } from '@/libs/chains/basic-rag/operations';
import { DEFAULT_ANSWER_INSTRUCTIONS as RAG_DEFAULT } from '@/libs/chains/basic-rag/config';
import { buildConversationMessages } from '@/libs/chains/conversation-chain/operations';
import { DEFAULT_ANSWER_INSTRUCTIONS as CONVERSATION_DEFAULT } from '@/libs/chains/conversation-chain/config';

/** Anything that reads like a placeholder, e.g. `<PL_PHONE_1>` or `<ENTITY_N>`. */
const PLACEHOLDER_SHAPE = /<[A-Z][A-Z_]*_[0-9N]+>/;

describe('buildPiiSystemInstruction', () => {
  it('returns no instruction when nothing was masked', () => {
    expect(buildPiiSystemInstruction({})).toBeNull();
  });

  it('describes the placeholders that are really in the question', () => {
    const instruction = buildPiiSystemInstruction({
      '<PL_NIP_1>': '1234567890',
      '<EMAIL_ADDRESS_1>': 'jan@firma.pl',
    });

    expect(instruction).toContain('<PL_NIP_1>');
    expect(instruction).toContain('<EMAIL_ADDRESS_1>');
    expect(instruction).toContain(
      'Never write a token for data you can read in the context',
    );
  });

  it('never names a placeholder the question does not contain', () => {
    const instruction = buildPiiSystemInstruction({ '<PL_NIP_1>': '1' }) ?? '';

    // The old instruction listed examples; `<PL_PHONE_1>` among them is what
    // the model copied for a phone number it could read in the context.
    expect(instruction).not.toContain('<PL_PHONE_1>');
    expect(instruction).not.toContain('<ENTITY_N>');
  });

  it('never carries the masked values themselves', () => {
    const instruction =
      buildPiiSystemInstruction({ '<PL_PHONE_1>': '+48 61 245 18 00' }) ?? '';

    expect(instruction).not.toContain('+48 61 245 18 00');
  });
});

describe('withPiiSystemInstruction', () => {
  it('returns the prompt untouched on an unmasked turn', () => {
    expect(withPiiSystemInstruction('Answer briefly.', {})).toBe(
      'Answer briefly.',
    );
    expect(withPiiSystemInstruction('', {})).toBe('');
  });

  it('appends the instruction on a masked turn', () => {
    const prompt = withPiiSystemInstruction('Answer briefly.', {
      '<PL_NIP_1>': '1234567890',
    });

    expect(prompt?.startsWith('Answer briefly.\n\n')).toBe(true);
    expect(prompt).toContain('<PL_NIP_1>');
  });
});

/**
 * The system prompt as the chains assemble it, from what `assistant-stream`
 * hands them. This is the seam the defect went through: every turn's system
 * prompt described `<PL_PHONE_1>`, whether or not anything was masked.
 */
describe('the system prompt a chain builds from it', () => {
  const PHONE_CONTEXT = 'Customer service: +48 61 245 18 00';

  it('carries no placeholder instruction for a RAG turn with nothing masked', () => {
    const { system } = buildRagMessages(
      'What number can I call?',
      undefined,
      PHONE_CONTEXT,
      '',
      withPiiSystemInstruction('', {}),
    );

    expect(system).not.toMatch(PLACEHOLDER_SHAPE);
    expect(system).toContain('+48 61 245 18 00');
    // And the chain's own default applies again: the unconditional
    // instruction used to fill the empty slot the default falls back on.
    expect(system).toContain(RAG_DEFAULT);
  });

  it('carries no placeholder instruction for a conversation turn with nothing masked', () => {
    const { system } = buildConversationMessages(
      'What number can I call?',
      undefined,
      withPiiSystemInstruction('', {}),
    );

    expect(system).not.toMatch(PLACEHOLDER_SHAPE);
    expect(system).toContain(CONVERSATION_DEFAULT);
  });

  it('keeps an organization prompt, and adds nothing, when nothing was masked', () => {
    const { system } = buildRagMessages(
      'q',
      undefined,
      PHONE_CONTEXT,
      '',
      withPiiSystemInstruction('Always answer in English.', {}),
    );

    expect(system).toContain('Always answer in English.');
    expect(system).not.toMatch(PLACEHOLDER_SHAPE);
  });

  it('carries the instruction when the question was masked', () => {
    const { system } = buildRagMessages(
      'Check NIP <PL_NIP_1>',
      undefined,
      '',
      '',
      withPiiSystemInstruction('Always answer in English.', {
        '<PL_NIP_1>': '1234567890',
      }),
    );

    expect(system).toContain('<PL_NIP_1>');
    expect(system).not.toContain('1234567890');
  });
});
