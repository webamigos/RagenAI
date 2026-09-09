import { describe, it, expect } from 'vitest';

import {
  DEFAULT_KNOWLEDGE_SCOPE,
  KNOWLEDGE_SCOPES,
  isKnowledgeScope,
  scopeRequiresProject,
  scopeRetrieves,
} from '../retrieval/knowledge-scope';

describe('knowledge scope', () => {
  it('is exactly the three levels the spec settled on', () => {
    expect(KNOWLEDGE_SCOPES).toEqual([
      'KNOWLEDGE_BASE',
      'ASSISTANT',
      'MODEL_ONLY',
    ]);
  });

  it('defaults to the knowledge base, so a client without the field still works', () => {
    expect(DEFAULT_KNOWLEDGE_SCOPE).toBe('KNOWLEDGE_BASE');
  });

  it.each([
    ['KNOWLEDGE_BASE', true],
    ['ASSISTANT', true],
    ['MODEL_ONLY', false],
  ] as const)('%s retrieves: %s', (scope, retrieves) => {
    expect(scopeRetrieves(scope)).toBe(retrieves);
  });

  it('only the assistant level needs a project', () => {
    expect(scopeRequiresProject('ASSISTANT')).toBe(true);
    expect(scopeRequiresProject('KNOWLEDGE_BASE')).toBe(false);
    expect(scopeRequiresProject('MODEL_ONLY')).toBe(false);
  });

  it.each([
    'knowledge-base',
    'knowledge_base',
    'Assistant',
    'none',
    '',
    null,
    undefined,
    3,
  ])('rejects %p', (value) => {
    expect(isKnowledgeScope(value)).toBe(false);
  });

  it('accepts every member of the list', () => {
    for (const scope of KNOWLEDGE_SCOPES) {
      expect(isKnowledgeScope(scope)).toBe(true);
    }
  });
});
