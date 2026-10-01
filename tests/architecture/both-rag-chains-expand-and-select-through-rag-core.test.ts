import { describe, expect, it } from 'vitest';

import { readSource } from './tracked-files';

/**
 * Context expansion is built once, in `packages/rag-core` (spec
 * 2026-09-29-llm-document-selection, D4), because apps/api keeps its own copy
 * of apps/web's RAG engine (ADR-21) and the two copies drift: a benchmark
 * that measures apps/web's expansion says nothing about an apps/api that
 * widened differently. So each chain must call rag-core's `expandHits`, and
 * neither may grow a local planner or merger beside it.
 *
 * Selection (Phase D) is held the same way: a model choosing passages in
 * one chain and a different prompt or parser in the other would measure one
 * and ship the other.
 */
const OPERATIONS = [
  'apps/web/src/libs/chains/basic-rag/operations.ts',
  'apps/api/src/chains/basic-rag/operations.ts',
];

const LOCAL_COPY =
  /function\s+(expandHits|mergeExpanded|planExpansion|joinTrimmingOverlap|selectSections|parseSelection|buildSelectionPrompt)\b/;

describe('both RAG chains expand and select through rag-core', () => {
  it.each(OPERATIONS)(
    '%s imports expandHits from @ragenai/rag-core',
    (path) => {
      const source = readSource(path);
      expect(source).toMatch(
        /import\s*\{[^}]*\bexpandHits\b[^}]*\}\s*from\s*'@ragenai\/rag-core'/,
      );
      expect(source).toMatch(/\bexpandHits\(/);
    },
  );

  it.each(OPERATIONS)('%s defines no expansion of its own', (path) => {
    expect(readSource(path)).not.toMatch(LOCAL_COPY);
  });
});
