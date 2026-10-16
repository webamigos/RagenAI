import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every `AGENTS.md` has to stay under Codex's `project_doc_max_bytes`.
 *
 * The default is 32,768 bytes, and content past that offset is dropped
 * **silently** — no warning, no truncation notice, nothing in a diff. An agent
 * simply stops being told about whatever sits at the end of the file, and the
 * first sign is a rule being broken by something that never read it.
 *
 * `AGENTS.md` says so in its own header and asks the reader to check with
 * `wc -c`. Nobody does, and it reached 32,732 bytes — 36 bytes of headroom, so
 * a single new Task Router row would have crossed the line and taken the
 * Post-Task Workflow section with it. Hence a test rather than a note.
 *
 * The margin is deliberate. Failing at exactly the limit would let the file
 * creep back to 32,767 and then break on the next one-line addition, which is
 * the state this guard was written to end. A kibibyte of slack is enough to
 * notice and act: move long-form detail into `docs/` and leave a pointer,
 * which is what the header asks for and what keeps the hard rules intact.
 *
 * **The limit is combined, not per file.** Codex walks from the repository
 * root to the directory it works in and concatenates every `AGENTS.md` on the
 * way, stopping once the total reaches `project_doc_max_bytes`. The guard
 * used to check each file on its own, so `apps/api/AGENTS.md` (26 KB) passed
 * comfortably while sitting behind a 31.6 KB root — and Codex working in
 * apps/api saw about one kilobyte of it. So the root gets a smaller budget, a
 * nested file gets what is left, and the pair is checked together.
 *
 * `CLAUDE.md` imports `AGENTS.md` at each level, so it is covered by whichever
 * `AGENTS.md` it points at. In apps/api and apps/worker it also imports the
 * long-form `docs/agent-guide.md`: Claude Code has no combined budget, so it
 * keeps the full brief that Codex can only be pointed to.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** Codex's default `project_doc_max_bytes`, across every file it concatenates. */
const HARD_LIMIT = 32_768;

/** The root file's share. Fails early enough to leave room for a nested file. */
const ROOT_BUDGET = 28_672;

/**
 * A nested file's share — what is left under the hard limit after a full root,
 * minus a kibibyte of slack so the pair never sits at the edge.
 */
const NESTED_BUDGET = HARD_LIMIT - ROOT_BUDGET - 1_024;

const ROOT_FILE = 'AGENTS.md';

const NESTED_FILES = [
  'apps/api/AGENTS.md',
  'apps/worker/AGENTS.md',
  // Written and re-added by `next dev` on Next 16, not by hand — nine lines
  // warning that this Next differs from an agent's training data. Covered here
  // because this list is exhaustive by design, not because it is at any risk
  // of growing.
  'apps/web/AGENTS.md',
  // Same file, same generator, one workspace later: `next dev` writes it into
  // every Next app. Committed rather than ignored, so the budget still covers
  // it — and so the first person to run `admin:dev` does not get a red
  // `npm run verify` for a file they never wrote.
  'apps/admin/AGENTS.md',
];

/** Where a nested brief keeps what it no longer has room for. */
const LONG_FORM_GUIDES: Record<string, string> = {
  'apps/api/AGENTS.md': 'apps/api/docs/agent-guide.md',
  'apps/worker/AGENTS.md': 'apps/worker/docs/agent-guide.md',
};

function sizeOf(relative: string): number {
  return readFileSync(join(REPO_ROOT, relative)).byteLength;
}

function read(relative: string): string {
  return readFileSync(join(REPO_ROOT, relative), 'utf8');
}

const advice =
  'Move long-form detail into docs/ and leave a pointer — do not trim the ' +
  'hard rules.';

describe('agent instruction files fit the instruction budget', () => {
  it('finds every file it claims to cover, so a rename cannot pass vacuously', () => {
    const missing = [ROOT_FILE, ...NESTED_FILES].filter(
      (f) => !existsSync(join(REPO_ROOT, f)),
    );

    expect(missing).toEqual([]);
  });

  it('the root file keeps room for a nested one', () => {
    const size = sizeOf(ROOT_FILE);

    expect(
      size,
      `${ROOT_FILE} is ${size} bytes, over its ${ROOT_BUDGET}-byte share of ` +
        `Codex's ${HARD_LIMIT}-byte combined limit. ${advice}`,
    ).toBeLessThanOrEqual(ROOT_BUDGET);
  });

  it.each(NESTED_FILES)('%s fits in what the root leaves', (file) => {
    const size = sizeOf(file);

    expect(
      size,
      `${file} is ${size} bytes, over the ${NESTED_BUDGET}-byte share a nested ` +
        `AGENTS.md gets — Codex reads it after the root, under one limit. ` +
        `${advice}`,
    ).toBeLessThanOrEqual(NESTED_BUDGET);
  });

  it.each(NESTED_FILES)('root + %s stays under the hard limit', (file) => {
    // Implied by the two budgets above; stated so that loosening one of them
    // cannot quietly reintroduce the truncation.
    expect(sizeOf(ROOT_FILE) + sizeOf(file)).toBeLessThan(HARD_LIMIT);
  });

  it.each(Object.entries(LONG_FORM_GUIDES))(
    '%s points to its long-form guide, and CLAUDE.md loads it',
    (brief, guide) => {
      expect(existsSync(join(REPO_ROOT, guide)), `${guide} is missing`).toBe(
        true,
      );
      expect(read(brief)).toContain('docs/agent-guide.md');

      const claude = read(brief.replace(/AGENTS\.md$/, 'CLAUDE.md'));
      expect(claude).toMatch(/^@AGENTS\.md$/m);
      expect(claude).toMatch(/^@docs\/agent-guide\.md$/m);
    },
  );

  it('covers every AGENTS.md in the repository, so a new one cannot be forgotten', () => {
    // A workspace gaining its own brief must be added to the list above, or
    // it would grow past the limit unwatched.
    const known = new Set([ROOT_FILE, ...NESTED_FILES]);
    const workspaces = ['apps', 'packages'].flatMap((dir) =>
      readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => `${dir}/${d.name}/AGENTS.md`),
    );
    const unwatched = workspaces.filter(
      (f) => existsSync(join(REPO_ROOT, f)) && !known.has(f),
    );

    expect(unwatched).toEqual([]);
  });
});
