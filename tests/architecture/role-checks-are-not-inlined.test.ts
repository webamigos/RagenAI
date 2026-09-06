import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * No source file outside `@ragenai/platform-contracts` compares a role field
 * against a role string literal.
 *
 * This is the tripwire ADR-39 asks for. The drift it prevents is not
 * hypothetical: `apps/api`'s `ProjectsService` and `FoldersService` each
 * carried their own `role === 'admin' || role === 'owner'`, with a comment
 * saying they deliberately did not import apps/web's copy. Three applications
 * therefore held three answers to one question, and typecheck saw nothing —
 * every copy was internally consistent while none of them was the definition.
 *
 * The rule is about the *vocabulary*, not about any one predicate: import
 * `canManageOrg`, `canOwnOrg`, `orgVisibilityScope`, `hasOrgRole` or
 * `isAppAdmin` when asking a capability question, and the exported
 * `ORG_ADMIN_ROLE` / `ORG_MEMBER_ROLE` / `ORG_OWNER_ROLE` constants when
 * genuinely comparing identity (which badge to paint, which menu item to
 * hide). A literal is the one thing that cannot be found by a grep for the
 * next person adding a role.
 *
 * Two deliberate exclusions:
 *
 * - `'user'` is not a forbidden literal. `Message.role === 'user'` is an LLM
 *   conversation role and has nothing to do with authorization; forbidding the
 *   word would train people to ignore this test.
 * - Test files are not scanned. A `vi.mock` of the contracts module has to
 *   supply an implementation, and that implementation is legitimately a
 *   comparison. Production code has no such excuse.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const PACKAGE = join('packages', 'platform-contracts');

/**
 * `<something>role === 'admin'` and its mirror image, in every spelling of
 * equality TypeScript allows.
 *
 * The identifier is either `role` (`member.role`, a bare `role` parameter) or
 * something ending in `Role` — `memberRole`, `currentUserRole`, `targetRole`.
 * The second form is not hypothetical: `hasOrgRole(memberRole, …)` names its
 * parameter that way, so a comparison written next to it would have been the
 * likeliest way to reintroduce exactly what this test forbids.
 */
const ROLE_LITERALS = ['owner', 'admin', 'member'] as const;
const LITERAL_GROUP = ROLE_LITERALS.join('|');
const ROLE_IDENTIFIER = '(?:role|[A-Za-z_$][\\w$]*Role)';
const INLINE_ROLE_COMPARISON = new RegExp(
  [
    `\\b${ROLE_IDENTIFIER}\\s*[!=]==?\\s*['"\`](?:${LITERAL_GROUP})['"\`]`,
    `['"\`](?:${LITERAL_GROUP})['"\`]\\s*[!=]==?\\s*(?:[A-Za-z_$][\\w$?.]*\\.)?${ROLE_IDENTIFIER}\\b`,
  ].join('|'),
);

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'generated',
  'coverage',
  '__tests__',
]);

const TEST_FILE = /\.(?:test|spec)\.tsx?$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return SKIP_DIRS.has(entry) ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry) && !TEST_FILE.test(entry) ? [full] : [];
  });
}

/**
 * Comments are stripped before matching.
 *
 * Several files explain the very pattern being forbidden — this one included,
 * and the two `apps/api` services whose comments record what they used to do.
 * A test that cannot survive being described is not one anybody will keep.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = [
  ...sourceFiles(join(REPO_ROOT, 'apps')),
  ...sourceFiles(join(REPO_ROOT, 'packages')),
].map((f) => ({
  path: relative(REPO_ROOT, f),
  code: stripComments(readFileSync(f, 'utf8')),
}));

describe('organization and platform role checks', () => {
  it('finds source files to scan, so this cannot pass on an empty sweep', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('are never inlined as a string comparison outside the contracts package', () => {
    const offenders = files
      .filter(({ code }) => INLINE_ROLE_COMPARISON.test(code))
      .map(({ path }) => path)
      .filter((path) => !path.startsWith(PACKAGE));

    expect(
      offenders,
      [
        'A role is compared against a string literal outside',
        '@ragenai/platform-contracts:',
        '',
        ...offenders.map((p) => `  ${p}`),
        '',
        'Ask the capability question instead — canManageOrg, canOwnOrg,',
        'orgVisibilityScope, hasOrgRole, isAppAdmin — or compare against the',
        'exported ORG_*_ROLE constant when you genuinely mean that one role.',
        'See ADR-39.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('still matches the pattern it is meant to catch', () => {
    // Guards the regex itself. A refactor that broke it would otherwise leave
    // this file green while checking nothing at all.
    expect(INLINE_ROLE_COMPARISON.test("member.role === 'admin'")).toBe(true);
    expect(INLINE_ROLE_COMPARISON.test('member.role !== "owner"')).toBe(true);
    expect(INLINE_ROLE_COMPARISON.test("role == 'member'")).toBe(true);
    expect(INLINE_ROLE_COMPARISON.test("'owner' === member.role")).toBe(true);
    expect(INLINE_ROLE_COMPARISON.test("memberRole === 'admin'")).toBe(true);
    expect(INLINE_ROLE_COMPARISON.test("'admin' === currentUserRole")).toBe(
      true,
    );

    // ...and does not catch what it must not.
    expect(INLINE_ROLE_COMPARISON.test("message.role === 'user'")).toBe(false);
    expect(INLINE_ROLE_COMPARISON.test('member.role === ORG_ADMIN_ROLE')).toBe(
      false,
    );
    expect(INLINE_ROLE_COMPARISON.test('canManageOrg(member.role)')).toBe(
      false,
    );
  });
});
