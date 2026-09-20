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
