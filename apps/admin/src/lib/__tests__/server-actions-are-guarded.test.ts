import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every exported Server Action must call `requireAdmin()` before it does
 * anything else.
 *
 * A Server Action is a POST endpoint that anyone can call directly; it does not
 * run the route's layout, so the role check in `(dashboard)/layout.tsx` does
 * not cover it. This audit exists because seven of the twelve action files once
 * had no session check at all — `banUserAction` among them.
 *
 * Reading the source is deliberate. Calling forty actions for real would need
 * the whole Prisma surface mocked, and would still miss the next action someone
 * adds; this fails the moment an unguarded export appears.
 */

const SRC = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === 'node_modules' ? [] : walk(full);
    }
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
  });
}

const actionFiles = walk(SRC).filter((f) =>
  /^(['"])use server\1/.test(readFileSync(f, 'utf8').trimStart()),
);

/**
 * Exported actions paired with their *first* statement.
 *
 * Checking the first statement, not merely that `requireAdmin()` appears
 * somewhere, is the point: an action that deletes a row and then calls the
 * guard would satisfy a substring search while still running unauthenticated.
 */
/**
 * Verb prefixes that mean the action changes state. Deliberately a prefix list
 * rather than "anything that is not a getter": a new verb should have to be
 * named here, which is a smaller mistake than a new writer slipping through.
 */
const MUTATING =
  /^(save|create|update|add|set|apply|delete|deactivate|toggle|ban|unban|rename|change|assign|remove|revoke|force|resend|sync|resolve|reactivate|cancel)/i;

/** Verbs that only read. Exempt from the audit rule, by name. */
const READ_ONLY = /^(get|list|fetch|load|search|count|check)/i;

function exportedActions(source: string) {
  const parts = source.split(/^export async function ([A-Za-z0-9_]+)/m);
  const found: { name: string; firstStatement: string; body: string }[] = [];

  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1];

    // Walk past the parameter list (which may span lines and contain braces
    // in inline types) to the brace that opens the function body.
    let depth = 0;
    let cursor = 0;
    for (; cursor < body.length; cursor++) {
      if (body[cursor] === '(') depth++;
      else if (body[cursor] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    // Skip the return-type annotation before looking for the body. A type
    // like `Promise<{ enabled: boolean }>` contains a brace, and taking the
    // first one after the parameter list read that as the function body —
    // reporting a properly guarded, properly audited action as violating
    // both rules. A false alarm rather than a miss, but a confusing one.
    let open = body.indexOf('{', cursor);
    const colon = body.indexOf(':', cursor);
    if (colon !== -1 && colon < open) {
      let angle = 0;
      let scan = colon;
      for (; scan < body.length; scan++) {
        const ch = body[scan];
        if (ch === '<') angle++;
        else if (ch === '>') angle--;
        else if (ch === '{' && angle === 0) break;
      }
      open = scan;
    }
    const firstStatement = body
      .slice(open + 1)
      .split(';')[0]
      .trim();

    // Walk to the brace that closes this function, so the audit rule below
    // cannot be satisfied by a `recordAdminAction(` belonging to a *later*
    // action in the same file — which is what slicing to end-of-file allowed.
    let braces = 0;
    let bodyEnd = open;
    for (; bodyEnd < body.length; bodyEnd++) {
      if (body[bodyEnd] === '{') braces++;
      else if (body[bodyEnd] === '}') {
        braces--;
        if (braces === 0) break;
      }
    }

    found.push({
      name: parts[i],
      firstStatement,
      body: body.slice(open + 1, bodyEnd),
    });
  }

  return found;
}

describe('admin Server Actions', () => {
  it('finds the action files to audit', () => {
    expect(actionFiles.length).toBeGreaterThan(0);
  });

  it.each(actionFiles.map((f) => [path.relative(SRC, f), f] as const))(
    '%s calls requireAdmin() as the first statement of every exported action',
    (_label, file) => {
      const source = readFileSync(file, 'utf8');
      const unguarded = exportedActions(source)
        .filter(
          ({ firstStatement }) =>
            !/^(const \w+ = )?await requireAdmin\(\)$/.test(firstStatement),
        )
        .map(({ name }) => name);

      expect(unguarded).toEqual([]);
    },
  );

  /**
   * Every action that changes something must also record who changed it.
   *
   * The panel rendered an Activity Log and wrote to it zero times, across
   * thirty mutating actions including `banUserAction` and
   * `saveOrgLimitsAction`. Reading the source is the same trade as the
   * guard audit above: calling every action for real would need the whole
   * Prisma surface mocked and would still miss the next one someone adds.
   *
   * Read-only actions are exempt by name. If a `get*` action ever starts
   * writing, that rename is the thing to notice.
   */
  it.each(actionFiles.map((f) => [path.relative(SRC, f), f] as const))(
    '%s records an audit entry in every mutating action',
    (_label, file) => {
      const source = readFileSync(file, 'utf8');
      const unrecorded = exportedActions(source)
        .filter(({ name }) => MUTATING.test(name))
        .filter(({ body }) => !body.includes('recordAdminAction('))
        .map(({ name }) => name);

      expect(unrecorded).toEqual([]);
    },
  );

  /**
   * The rule above only bites on names it recognises, which makes an
   * unrecognised verb a silent exemption rather than a failure. That is not
   * hypothetical: `deactivate`, `revoke` and `force` were each missing when
   * the action using them was added, so three writers passed this file green
   * while recording nothing.
   *
   * So an action whose name matches neither list fails here. Adding a verb to
   * one of them is a deliberate one-line decision; forgetting to is no longer
   * free.
   */
  it('classifies every exported action as either mutating or read-only', () => {
    const unclassified = actionFiles.flatMap((file) =>
      exportedActions(readFileSync(file, 'utf8'))
        .filter(({ name }) => !MUTATING.test(name) && !READ_ONLY.test(name))
        .map(({ name }) => `${path.relative(SRC, file)}: ${name}`),
    );

    expect(unclassified).toEqual([]);
  });

  it('recognises some actions as mutating, so the audit rule is not vacuous', () => {
    const mutating = actionFiles.flatMap((file) =>
      exportedActions(readFileSync(file, 'utf8'))
        .filter(({ name }) => MUTATING.test(name))
        .map(({ name }) => name),
    );

    expect(mutating.length).toBeGreaterThan(20);
  });

  it('has no exported action that is not async', () => {
    const offenders = actionFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const syncExports =
        source.match(/^export function [A-Za-z0-9_]+/gm) ?? [];
      return syncExports.map((m) => `${path.relative(SRC, file)}: ${m}`);
    });

    // A synchronous export could not await the guard.
    expect(offenders).toEqual([]);
  });
});
