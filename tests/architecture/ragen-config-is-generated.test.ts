import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderShippedConfig } from '../../scripts/config/generate-ragen-config.mjs';

/**
 * `ragen.config.ts` is an artifact of the installer's template, and this is
 * what makes that true.
 *
 * The installer **overwrites** this file wholesale when it scaffolds, so a
 * change made here and not made in the template is discarded the next time
 * anyone runs `npm create ragen-app` — silently, and only for them. That is a
 * worse failure than the drift this kind of test usually guards, because the
 * person who loses the edit is not the person who made it.
 *
 * The file is committed rather than generated on demand for two reasons:
 * `typecheck:config` compiles it, which is what makes "choosing s3 without a
 * bucket does not compile" a checked claim, and a fresh clone needs one before
 * the installer has ever run.
 */
const SHIPPED = join(import.meta.dirname, '..', '..', 'ragen.config.ts');

describe('the shipped config matches the installer template', () => {
  it('is what the template would write for a fresh clone', () => {
    expect(
      readFileSync(SHIPPED, 'utf8'),
      'ragen.config.ts is out of date. Run `npm run config:template` — and if you edited it by hand, put the change in packages/create-ragen-app/src/config-template.ts instead, or the installer will overwrite it on the next scaffold.',
    ).toBe(renderShippedConfig());
  });

  it('renders a config rather than an empty shell', () => {
    // A template that silently produced only the header would make the
    // comparison above pass against an equally empty file.
    const rendered = renderShippedConfig();

    expect(rendered).toContain('defineConfig({');
    expect(rendered).toContain("provider: 'local'");
    expect(rendered).toContain('database: {');
  });
});
