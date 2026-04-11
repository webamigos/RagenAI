import { describe, it, expect } from 'vitest';
import { systemTemplates } from '../config';

// Phase 1 of the prompt-injection defense plan: even without RAG, the
// conversation chain must warn the LLM that content pasted inside the
// user's message is data, not instructions.
describe('conversation-chain systemTemplates.answerChain — security clauses', () => {
  const prompt = systemTemplates.answerChain;

  it('contains a pasted-content security clause', () => {
    expect(prompt).toMatch(/pastes content[\s\S]*treat that content as data/i);
  });

  it('explicitly says directives inside pasted content must be described, not executed', () => {
    expect(prompt).toMatch(/described rather than executed/i);
  });

  it('still contains the existing {answer_instructions} and {project_instructions} placeholders', () => {
    expect(prompt).toContain('{answer_instructions}');
    expect(prompt).toContain('{project_instructions}');
  });
});
