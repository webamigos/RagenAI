import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderConfigReference } from '../../scripts/docs/generate-config-reference.mjs';

/**
 * The published configuration reference is a build artifact, and this is what
 * makes that true rather than aspirational.
 *
 * A generated file that is committed and never checked is just a file someone
 * edited once. The cost of letting it drift is measured rather than assumed:
 * reviewing the hand-written reference in #1114 against the source found it
 * naming `S3_ENDPOINT_URL` as required when it is optional, omitting
 * `S3_SESSION_TOKEN`, and stating the encryption failure mode backwards. Five
 * of the seven findings were the page restating something the schemas already
 * encoded, and disagreeing with them.
 *
 * So the page is regenerated here and compared. It fails both ways round: a
 * hand edit to the markdown, and a change to `provider-seams.ts` or
 * `config-groups.ts` that nobody re-rendered.
 */
const PAGE = join(
  import.meta.dirname,
  '..',
  '..',
  'apps',
  'docs',
  'docs',
  'configuration-reference.md',
);

describe('the configuration reference matches the tables', () => {
  it('is what the generator would write today', async () => {
    const committed = readFileSync(PAGE, 'utf8');

    expect(
      committed,
      'apps/docs/docs/configuration-reference.md is out of date. Run `npm run docs:config-reference` — and if you edited it by hand, put the change in packages/env instead, where the boot-time check and the typed config read it too.',
    ).toBe(await renderConfigReference());
  });

  it('describes something rather than rendering an empty page', async () => {
    // A generator that silently produced a heading and no tables would make
    // the comparison above pass against an equally empty file.
    const rendered = await renderConfigReference();

    expect(rendered).toContain('S3_BUCKET_NAME');
    expect(
      rendered.split('\n').filter((l) => l.startsWith('| `')).length,
    ).toBeGreaterThan(20);
  });
});
