import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A command the instructions tell you to run is a command that exists.
 *
 * `AGENTS.md` listed `npm run test:e2e` in its command table and required
 * `npm run build` before the suite. Neither script is defined at the root —
 * they are `web:e2e` and `web:build` — so following the documentation produced
 * `npm error Missing script: "build"`, which reads as a broken checkout rather
 * than as a wrong instruction. `docs/testing-conventions.md` and two skills
 * repeated it.
 *
 * That is worse than an ordinary stale doc, because the same file also says
 * the build is not optional and that skipping it makes the suite fail in a way
 * indistinguishable from an auth regression — advice somebody then cannot
 * follow, at exactly the moment they most need it.
 *
 * ## Why this list and not every markdown file
 *
 * A blanket scan is wrong here, and the first version of it produced 68 hits
 * that were almost all legitimate:
 *
 * - `packages/create-ragen-app/README.md` documents the *scaffolded* app's
 *   scripts, which are not this repository's.
 * - `docs/companion-services.md` documents sibling repositories.
 * - Docs under `apps/web/` quote root commands, which a nearest-package.json
 *   heuristic resolves against the wrong manifest.
 * - Specs name commands a later phase will add; `docs/specs/` describes what
 *   is intended, by definition before it exists.
 * - Lessons and ADRs record what was written at the time, and rewriting
 *   history to match today's scripts would destroy the record.
 *
 * So the scope is the files somebody follows step by step. Adding a file here
 * is a statement that its commands are meant to work today.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** Documents whose `npm run …` lines are instructions, not narrative. */
const INSTRUCTION_FILES = [
  'AGENTS.md',
  'CONTRIBUTING.md',
  'docs/testing-conventions.md',
  '.claude/skills/ragen-e2e-triage/SKILL.md',
  '.claude/skills/ragen-upgrade-dependency/SKILL.md',
  '.claude/skills/ragen-tenant-scope-audit/SKILL.md',
  '.claude/skills/ragen-code-review/SKILL.md',
];

/**
 * Commands a listed file may name before they exist.
 *
 * Empty, and meant to stay that way: an instruction file is where somebody
 * looks for what to run *now*. A command that is still to be built belongs in
 * a spec. An entry here should carry the reason and the phase that adds it.
 */
const NOT_YET_BUILT = new Set<string>([]);

const rootScripts = new Set(
  Object.keys(
    JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts ??
      {},
  ),
);

describe('the commands the instructions name', () => {
  it.each(INSTRUCTION_FILES)('all exist — %s', (file) => {
    const text = readFileSync(join(REPO_ROOT, file), 'utf8');

    const missing = [
      ...new Set(
        [...text.matchAll(/npm run ([a-z0-9:_-]+)/g)]
          .map((m) => m[1])
          .filter(
            (script) => !rootScripts.has(script) && !NOT_YET_BUILT.has(script),
          ),
      ),
    ];

    expect(
      missing,
      [
        `${file} names npm scripts the root package.json does not define.`,
        'Somebody following it gets `npm error Missing script`, which reads as',
        'a broken checkout rather than a wrong instruction. Fix the document,',
        'or add the script.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('covers the file that got this wrong', () => {
    // AGENTS.md is the one every agent reads first, and it carried two
    // non-existent commands for long enough that a skill quoted one of them.
    expect(INSTRUCTION_FILES).toContain('AGENTS.md');
  });
});
