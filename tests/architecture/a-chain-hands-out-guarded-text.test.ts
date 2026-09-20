import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every way text leaves a chain goes through the output window.
 *
 * `mapFullStream` is one of them, and for a while it was the only guarded one.
 * The chains also handed out the AI SDK's own `textStream`, which never met
 * the window — so an output rule applied to the panel and the widget and to
 * nothing else, across five call sites in two apps, with no runtime signal
 * saying so. A rule that reads as enabled and is enforced on some surfaces is
 * worse than one that is enforced on none, because the gap is invisible.
 *
 * The fix was to derive `textStream` from the mapped stream. This is what
 * keeps it derived: the next person to add an exit, or to "simplify" this one
 * back to the SDK's, fails here rather than in production.
 *
 * Source text rather than behaviour, on purpose. What is being asserted is
 * that no chain *hands out* the unguarded stream — a property of the wiring,
 * which a running chain cannot be asked about without a model call.
 */

const ROOT = join(import.meta.dirname, '../..');

const CHAINS = [
  'apps/web/src/libs/chains/basic-rag/chain.ts',
  'apps/web/src/libs/chains/conversation-chain/chain.ts',
  'apps/api/src/chains/basic-rag/chain.ts',
];

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('a chain hands out guarded text', () => {
  it.each(CHAINS)('%s does not return the SDK stream as textStream', (path) => {
    const source = read(path);

    expect(
      source,
      `${path} returns the AI SDK's own textStream, which the output window ` +
        'never sees. Derive it from the mapped stream with `textOfStream`.',
    ).not.toMatch(/textStream:\s*result\.textStream/);
  });

  it.each(CHAINS)('%s derives its text from the mapped stream', (path) => {
    const source = read(path);

    expect(
      source,
      `${path} should pass its mapped stream through textOfStream`,
    ).toMatch(/textStream:\s*textOfStream\(/);
  });

  it.each(CHAINS)('%s maps the full stream through the window', (path) => {
    const source = read(path);

    // The other half of the same claim: `textOfStream` guards nothing if what
    // it is given is the raw SDK stream rather than `mapFullStream`'s output.
    expect(source, `${path} should call mapFullStream`).toMatch(
      /mapFullStream\(/,
    );
  });
});

/**
 * The one exit that is not guarded, and the one reader allowed to touch it.
 *
 * `ChainStreamResult.text` is the AI SDK's own promise: the window is
 * streaming state, so guarding it would mean a second window over the same
 * answer — two buffers, two hits filed for one block. `apps/api` has no reader
 * for it and no such field; `apps/web` has exactly one, and it must not run on
 * a refused turn or the turn stores the text the rule stopped.
 *
 * Asserted here because the alternative is remembering, which is what this
 * whole phase is about not doing.
 */
describe('the resolved text is read only where a refusal is checked', () => {
  const ASSISTANT_STREAM =
    'apps/web/src/app/api/threads/services/assistant-stream.ts';

  it('has one reader in apps/web, and it is the empty-answer fallback', () => {
    const source = read(ASSISTANT_STREAM);
    const reads = source.match(/streamResult\.text/g) ?? [];

    expect(
      reads.length,
      "the model's own text has grown a second reader; each one is a way to " +
        'store an answer the output window never saw',
    ).toBe(1);
  });

  it('gates that fallback on the guardrail having not fired', () => {
    const source = read(ASSISTANT_STREAM);

    expect(
      source,
      'the empty-answer fallback must not run on a refused turn: it reads the ' +
        "model's own text, which never passed through the window",
    ).toMatch(/if \(!fullMessage && !guardrailBlocked\)/);
  });

  it('is absent from the API chain, which has no reader for it', () => {
    const source = read('apps/api/src/chains/basic-rag/chain.ts');

    expect(source).not.toMatch(/^\s*text:\s*result\.text/m);
  });
});
