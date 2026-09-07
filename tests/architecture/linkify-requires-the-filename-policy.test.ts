import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Any markdown renderer with `linkify` on must also apply the filename policy.
 *
 * With `linkify: true`, markdown-it hands plain text to linkify-it, which
 * links a bare host with no scheme. It decides what a host is by matching the
 * trailing label against the IANA TLD list — which contains `md` (Moldova),
 * `pl`, `sh`, `zip`, `mov` and `py`. In a product whose answers cite
 * filenames, that turned `availability.md` into a link to a domain nobody here
 * controls.
 *
 * Two renderers had linkify on and were configured independently, several
 * paragraphs apart in unrelated files. A third would be written the same way,
 * and the bug would come back on one surface only — which is the worst
 * version, because the other surface would look like proof it was fixed.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const WEB_SRC = join(REPO_ROOT, 'apps', 'web', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Files that switch linkify on, whatever else they configure. */
function linkifyingFiles(): { path: string; source: string }[] {
  return sourceFiles(WEB_SRC)
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => /linkify:\s*true/.test(source));
}

describe('linkify carries the filename policy', () => {
  const files = linkifyingFiles();

  it('finds the renderers, so a moved file cannot pass vacuously', () => {
    // Two when this was written. More is fine; none means the search broke.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map(({ path }) => path.replace(`${REPO_ROOT}/`, '')))(
    '%s applies applyLinkifyPolicy',
    (relative) => {
      const entry = files.find(
        ({ path }) => path.replace(`${REPO_ROOT}/`, '') === relative,
      );

      expect(
        entry?.source,
        `${relative} sets linkify: true without calling applyLinkifyPolicy. Bare text whose last segment is a TLD — and .md, .pl, .sh, .zip, .mov and .py all are — will render as an external link, so a filename cited in an answer becomes a link off-site. See apps/web/src/libs/markdown/linkify-policy.ts.`,
      ).toMatch(/applyLinkifyPolicy/);
    },
  );
});
