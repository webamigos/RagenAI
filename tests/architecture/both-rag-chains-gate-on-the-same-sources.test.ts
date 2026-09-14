import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `apps/api` keeps its own copy of apps/web's RAG engine (ADR-21), and
 * AGENTS.md calls that duplication "the repo's most-repeated bug source". This
 * is the one place where a drift between the copies is a security hole rather
 * than a bug.
 *
 * `ragContextPresent` tells the MCP write-tool gate whether anything untrusted
 * reached the model this turn. Too narrow, and a write tool runs unpaused with
 * injected content in the prompt — the exfiltration path the gate exists to
 * close.
 *
 * It has already drifted twice, in the same direction. apps/web learned to
 * count attached *text* and apps/api did not. Then both missed attached
 * *images*, which never pass through `context` or `threadContext` at all — they
 * go straight into the multimodal message, so an image-only turn read as
 * "nothing attached" while the picture was in the prompt.
 *
 * Comparing the expressions is cruder than testing behaviour, and deliberately
 * so: `apps/api` has no chain-level test to extend, and what actually fails
 * here is one copy being edited and the other forgotten. A behavioural test in
 * each app would not have caught that — apps/web's passed throughout.
 */
describe('both RAG chains gate on the same sources', () => {
  const CHAINS = [
    'apps/web/src/libs/chains/basic-rag/chain.ts',
    'apps/api/src/chains/basic-rag/chain.ts',
  ];

  /** The `ragContextPresent` assignment, collapsed to one line. */
  function gatingExpression(relativePath: string): string {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
    const match = source.match(/const ragContextPresent\s*=([\s\S]*?);/);
    if (!match) {
      throw new Error(`no ragContextPresent assignment in ${relativePath}`);
    }
    return match[1].replace(/\s+/g, ' ').trim();
  }

  const expressions = CHAINS.map(gatingExpression);

  it('finds the assignment in both copies', () => {
    for (const expression of expressions) {
      expect(expression.length).toBeGreaterThan(0);
    }
  });

  it('computes it identically in both copies', () => {
    expect(expressions[1]).toBe(expressions[0]);
  });

  it.each(CHAINS)('counts attached images in %s', (path) => {
    // Named explicitly rather than left to the equality check above: two copies
    // that drift together are still wrong, and this is the source that carries
    // no text and is therefore the easiest to forget.
    expect(gatingExpression(path)).toContain('imageThreadDocs.length > 0');
  });
});
