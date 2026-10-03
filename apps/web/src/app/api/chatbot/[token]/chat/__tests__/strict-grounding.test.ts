import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The embedded widget answers only from the organization's documents (spec
 * 2026-10-03-retrieval-claims, C2): it has no assistant to carry the setting,
 * so the route forces it. Read as text, because the route's POST builds its
 * chain inside a stream and the forcing is one argument — the kind of wiring
 * that disappears in a refactor with every suite still green.
 */
describe('the embedded widget chat route', () => {
  it('forces answer-from-documents-only on its chain', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', 'route.ts'),
      'utf8',
    );
    const call = source.slice(source.indexOf('initializeRagChain({'));
    const args = call.slice(0, call.indexOf('});'));
    expect(args).toMatch(/answerFromDocumentsOnly:\s*true/);
  });
});
