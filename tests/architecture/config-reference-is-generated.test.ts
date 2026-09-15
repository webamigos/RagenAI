import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  renderConfigReference,
  target as PAGE,
} from '../../scripts/docs/generate-config-reference.mjs';

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
/**
 * The page now lives in the ragen-docs repository, so this comparison can only
 * run where that is checked out beside this one. In CI it is not, which is the
 * price of keeping one artifact instead of two.
 *
 * It is split into two tests rather than skipped wholesale: the generator is
 * exercised everywhere, so a change that breaks rendering still fails in CI,
 * and only the file comparison is conditional. A guard that quietly does
 * nothing is worse than no guard, because it reads as coverage.
 */
const pagePresent = existsSync(PAGE);

describe('the configuration reference matches the tables', () => {
  /** Runs everywhere, including CI: a broken generator is caught with or
   * without the docs repo present. */
  it('renders every provider seam and field group', async () => {
    const rendered = await renderConfigReference();

    expect(rendered).toContain('## Providers');
    expect(rendered).toContain('## Settings');
    // A rendering failure that produced a stub would otherwise pass the
    // headings check above.
    expect(rendered.split('\n').length).toBeGreaterThan(100);
  });

  it.skipIf(!pagePresent)(
    'is what the generator would write today',
    async () => {
      const committed = readFileSync(PAGE, 'utf8');

      expect(
        committed,
        `${PAGE} is out of date. Run \`npm run docs:config-reference\` — and if you edited it by hand, put the change in packages/env instead, where the boot-time check and the typed config read it too.`,
      ).toBe(await renderConfigReference());
    },
  );

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
