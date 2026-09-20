import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every value the resolver honours can be set from somewhere.
 *
 * **This guard runs the opposite way from every other one in this directory**,
 * and that is the whole reason it exists. The rest catch a rule an operator can
 * author that no evaluator reads — `LLM_POLICY` before C3,
 * `content-moderation` before Phase B, `jailbreak-detection` before C2. The
 * failure they describe is loud once you look for it: somebody enables a rule
 * and nothing happens.
 *
 * The opposite failure is silent in a way that survives review. The resolver
 * grows a branch for a column, with validation and its own `dropped` reason,
 * and no surface in the product can produce the value. Nothing is unenforced;
 * there is a knob with no handle, and the code reads as though the feature is
 * there. Three of them accumulated here — a scored built-in's `threshold`, and
 * an override's `action` and `threshold` — and they were found by accident,
 * while writing something else.
 *
 * It happens because a schema designed ahead of its panel is *deliberately*
 * how this feature was built: the columns landed in Phase A so every reader had
 * them before a writer appeared. That is a good decision with one cost, and
 * this test is the cost being paid.
 *
 * Matched as source text, like the other guards here, because the thing it
 * forbids typechecks perfectly — a column nobody writes is not a type error.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const read = (...parts: string[]): string =>
  readFileSync(join(REPO_ROOT, ...parts), 'utf8');

/**
 * The fields the resolver reads off an override, and where each is written.
 *
 * Adding a branch to `applyOverride` without adding a row here fails the
 * completeness check below, so the list cannot quietly fall behind the
 * resolver it describes.
 */
const OVERRIDE_FIELDS = [
  {
    field: 'enabled',
    writtenIn: 'apps/admin/src/app/(dashboard)/guardrails/org-actions.ts',
  },
  {
    field: 'action',
    writtenIn: 'apps/admin/src/app/(dashboard)/guardrails/org-actions.ts',
  },
  {
    field: 'threshold',
    writtenIn: 'apps/admin/src/app/(dashboard)/guardrails/org-actions.ts',
  },
] as const;

describe('a resolver branch has a writer', () => {
  const resolver = read(
    'packages',
    'guardrails',
    'src',
    'resolver',
    'resolve.ts',
  );

  it.each(OVERRIDE_FIELDS)(
    'an override’s $field is written by $writtenIn',
    ({ field, writtenIn }) => {
      // Present in the resolver: otherwise this row describes a branch that no
      // longer exists and the assertion below guards nothing.
      expect(
        resolver,
        `the resolver no longer reads override.${field} — remove this row ` +
          'rather than leaving it to pass over nothing.',
      ).toMatch(new RegExp(`override\\.${field}`));

      const writer = read(writtenIn);

      // Written, and written as part of a row rather than merely mentioned.
      // `data: { enabled, action, threshold, origin: null }` is the shape;
      // reading the column back for a form is not writing it.
      expect(
        new RegExp(`data:\\s*\\{[^}]*\\b${field}\\b`, 's').test(writer),
        `${writtenIn} never writes ${field} into an override row. The ` +
          'resolver honours it, validates it and has a `dropped` reason for ' +
          'it — a value no surface can produce is a knob with no handle, ' +
          'and it reads as though the feature is there.',
      ).toBe(true);
    },
  );

  /**
   * The completeness half, and the one that makes this test more than a list.
   *
   * Without it, a fourth override field could be added to the schema and the
   * resolver and this file would keep passing, describing three of four —
   * which is exactly how the first three got here.
   */
  it('names every override field the resolver branches on', () => {
    // **Every mention, not one comparison shape.** The first version matched
    // `override.x != null`, which is how `action` and `threshold` are read and
    // is *not* how `enabled` is — that one is
    // `override.enabled === true || override.enabled === false`, because
    // `false` is a decision and `null` is not. A pattern narrower than the
    // thing it forbids is the first shape in
    // docs/lessons/three-shapes-of-a-test-that-guards-nothing.md, and it would
    // have let a fourth field be read in a fourth shape and covered by
    // nothing.
    const branched = new Set(
      [...resolver.matchAll(/override\.([a-zA-Z]+)/g)].map((m) => m[1]),
    );

    // Excluded by name rather than by a pattern happening to miss them.
    // The first two identify the row; `origin` is read but never set by an
    // administrator — the migration seeds it and the panel clears it — so it
    // is not a tuning value with a missing writer.
    for (const structural of [
      'guardrailPublicId',
      'organizationId',
      'origin',
    ]) {
      branched.delete(structural);
    }

    expect(
      [...branched].sort(),
      'The resolver branches on an override field this test does not cover. ' +
        'Add it to OVERRIDE_FIELDS with the file that writes it — or, if ' +
        'nothing writes it yet, that is the finding.',
    ).toEqual(OVERRIDE_FIELDS.map((f) => f.field).sort());
  });

  /**
   * The platform rule's own scored threshold, which is the third of the three
   * and lives on a different page.
   */
  it('a scored rule’s own threshold is written by the platform rule form', () => {
    const judge = read(
      'packages',
      'guardrails',
      'src',
      'evaluator',
      'policy.ts',
    );
    expect(judge).toContain('export function policyThresholdFor');

    const actions = read(
      'apps/admin/src/app/(dashboard)/guardrails/actions.ts',
    );
    expect(
      /columns\.threshold\s*=/.test(actions),
      'The platform rule form no longer writes a threshold, so ' +
        '`policyThresholdFor` reads a column only SQL can set — which is ' +
        'how `jailbreak-detection` ran at whatever the migration seeded.',
    ).toBe(true);
  });
});
