import { describe, expect, it } from 'vitest';

import { buildRagMessages } from '../basic-rag/operations';
import { buildConversationMessages } from '../conversation-chain/operations';

/**
 * The personal-memory block (spec 2026-09-27-personal-memory-across-threads,
 * D1) is appended to both chains' system prompts after every template field
 * is filled: present when there are memories, absent otherwise, and never
 * part of the retrieved `{context}` — a citation must never point at a
 * memory.
 */
const BLOCK =
  'What you know about the user from earlier conversations:\n- Prefers bullet points.';
const CONTEXT = '<document>The VAT rate is 23%.</document>';

describe('the memory block in the basic-RAG system prompt', () => {
  const build = (memoryBlock?: string) =>
    buildRagMessages(
      'What is the VAT rate?',
      undefined,
      CONTEXT,
      '',
      'Answer briefly.',
      '',
      undefined,
      memoryBlock,
    ).system;

  it('is present when the user has memories, after the context', () => {
    const system = build(BLOCK);
    expect(system.endsWith(BLOCK)).toBe(true);
    expect(system.indexOf(CONTEXT)).toBeLessThan(system.indexOf(BLOCK));
  });

  it('is absent otherwise, leaving the prompt as it was', () => {
    expect(build('')).toBe(build(undefined));
    expect(build(undefined)).not.toContain('Prefers bullet points');
  });

  it('is not a template field: a memory naming {context} stays literal', () => {
    const system = build('- Wants {context} quoted verbatim.');
    expect(system).toContain('- Wants {context} quoted verbatim.');
    expect(system.split(CONTEXT)).toHaveLength(2);
  });
});

describe('the memory block in the conversation system prompt', () => {
  const build = (memoryBlock?: string) =>
    buildConversationMessages(
      'Hello',
      undefined,
      'Answer briefly.',
      '',
      undefined,
      memoryBlock,
    ).system;

  it('is present when the user has memories', () => {
    expect(build(BLOCK).endsWith(BLOCK)).toBe(true);
  });

  it('is absent otherwise', () => {
    expect(build(undefined)).not.toContain('Prefers bullet points');
  });
});
