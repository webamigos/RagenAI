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
function exportedActions(source: string) {
  const parts = source.split(/^export async function ([A-Za-z0-9_]+)/m);
  const found: { name: string; firstStatement: string }[] = [];

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
    const open = body.indexOf('{', cursor);
    const firstStatement = body
      .slice(open + 1)
      .split(';')[0]
      .trim();

    found.push({ name: parts[i], firstStatement });
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
