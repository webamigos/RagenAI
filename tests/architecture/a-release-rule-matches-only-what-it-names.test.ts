import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A `releaseRules` value in `.releaserc` is a **glob**, matched with
 * micromatch — not a substring.
 *
 * `@semantic-release/commit-analyzer` calls `micromatch.isMatch(subject, rule)`
 * (`lib/analyze-commit.js`), so `"*[no release]*"` is not the marker it looks
 * like. `[no release]` is a character class: one character out of
 * `n o ' ' r e l a s`. Against the subjects actually in this history —
 * "publish the worker, api and admin images", "one reading of IS_ON_PREMISE" —
 * it matches every one of them, pairs them with `release: false`, and, because
 * a matched rule returns `false` rather than `undefined`, stops the fallback to
 * the default rules that would otherwise have released them.
 *
 * The result is that no commit releases anything, ever. Nothing fails, no job
 * turns red, and the only symptom is a release that does not arrive — which is
 * a slow thing to notice on a repository that releases on every push to `main`
 * and publishes five container images from it (`publish-images.yml`).
 *
 * It shipped that way in the change that added the opt-out, and CodeRabbit
 * caught it. Hence a test: the escaping is one backslash pair, in a file nobody
 * opens twice a year, and the cost of getting it wrong is every release.
 *
 * See ADR-50, "Which commits cut a release".
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

type ReleaseRule = Record<string, unknown>;

const releaseRules = (): ReleaseRule[] => {
  const config = JSON.parse(readFileSync(join(REPO_ROOT, '.releaserc'), 'utf8')) as {
    plugins: (string | [string, { releaseRules?: ReleaseRule[] }])[];
  };

  const analyzer = config.plugins.find(
    (plugin): plugin is [string, { releaseRules?: ReleaseRule[] }] =>
      Array.isArray(plugin) && plugin[0] === '@semantic-release/commit-analyzer',
  );

  return analyzer?.[1].releaseRules ?? [];
};

/** A `[` or `]` that is not preceded by a backslash — micromatch reads it as a class. */
const UNESCAPED_BRACKET = /(?<!\\)[[\]]/;

describe('a release rule matches only what it names', () => {
  it('escapes every bracket in a glob, so a marker is not a character class', () => {
    for (const rule of releaseRules()) {
      for (const [key, value] of Object.entries(rule)) {
        if (key === 'release' || typeof value !== 'string') {
          continue;
        }

        expect(
          UNESCAPED_BRACKET.test(value),
          `\`${key}: "${value}"\` in .releaserc has an unescaped bracket. micromatch reads it ` +
            `as a character class, so the rule matches far more than it names. Write \\[ and \\].`,
        ).toBe(false);
      }
    }
  });

  /**
   * Not a style rule. `release: false` on a rule that a breaking commit can
   * match would suppress the one release that must never be suppressed: the
   * notes announcing the break go out with it or not at all.
   *
   * Order does not decide it — matching rules resolve to the *highest* release
   * type, not the first — so what this asserts is that the rule exists at all.
   */
  it('keeps a breaking change releasing, whatever else a commit matches', () => {
    expect(releaseRules()).toContainEqual({ breaking: true, release: 'major' });
  });
});
