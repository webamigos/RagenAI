import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every `recordAdminAction` call can actually be written.
 *
 * `AuditLog.organizationId` is required and carries a foreign key, so
 * `recordAdminAction` writes an `AuditLog` row when it is given an
 * `organizationId` and a `SecurityEvent` when it is given a `securityEvent`.
 * Handed neither it **throws**, deliberately: the module's whole argument is
 * that a silent audit trail is worse than a loud failure.
 *
 * The cost of that choice is that the throw lands at the *end* of a mutating
 * Server Action, after the write it was meant to record. All six calls in
 * `/mcp-catalogue` passed neither — the catalogue is platform configuration and
 * belongs to no organization — so creating, editing, enabling, deleting or
 * testing a connector wrote the row, threw, and rendered "A server error
 * occurred" over a mutation that had in fact succeeded. Every mutation on the
 * one screen ADR-52 exists to provide, and the page's own suite was green
 * because it does `vi.mock('@/lib/audit')`: the stub cannot throw, so the test
 * that covered the call could not see the bug in it.
 *
 * That is why this reads source text instead of running the actions. A unit
 * test of a caller has to mock this module — it writes to the database — and a
 * mock of the thing being checked proves nothing about it. The rule is
 * structural, so it is checked structurally.
 *
 * Limits, stated rather than discovered: the argument object is found by brace
 * matching from the call, so a call assembled from a variable
 * (`recordAdminAction(input)`) is invisible here. That is the same trade every
 * test in this directory makes, and the common shape — an object literal at the
 * call site — is the one that has gone wrong.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const ADMIN_SRC = join(REPO_ROOT, 'apps', 'admin', 'src');

/** Source files under a directory, skipping tests and mocks. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!/(__tests__|__mocks__|generated)$/.test(entry)) {
        out.push(...sourceFiles(path));
      }
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const CALL = 'recordAdminAction({';

/**
 * The text of each `recordAdminAction({ … })` argument object in a file.
 *
 * Brace matching rather than a regular expression: the argument spans lines and
 * nests its own `before`/`after` objects, so the first `});` is not the end of
 * it. String and comment contents are not parsed — a lone brace inside either
 * would confuse this — which no call site has and a failure would make obvious.
 */
function auditCallBodies(source: string): string[] {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(CALL, from);
    if (start === -1) {
      return bodies;
    }
    let depth = 0;
    let index = start + CALL.length - 1;
    for (; index < source.length; index += 1) {
      if (source[index] === '{') {
        depth += 1;
      } else if (source[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
    }
    bodies.push(source.slice(start, index + 1));
    from = index + 1;
  }
}

/** A key at the top level of the argument object, not inside a nested one. */
function hasTopLevelKey(body: string, key: string): boolean {
  let depth = 0;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === '{') {
      depth += 1;
      continue;
    }
    if (body[index] === '}') {
      depth -= 1;
      continue;
    }
    if (depth === 1 && body.startsWith(key, index)) {
      const before = body[index - 1];
      const after = body.slice(index + key.length).match(/^\s*:/);
      if (after && (before === undefined || /[\s,{]/.test(before))) {
        return true;
      }
    }
  }
  return false;
}

type Call = { file: string; body: string };

const calls: Call[] = sourceFiles(ADMIN_SRC).flatMap((file) =>
  auditCallBodies(readFileSync(file, 'utf8')).map((body) => ({ file, body })),
);

const relative = (file: string) => file.slice(REPO_ROOT.length + 1);

/** The `action:` value, for a failure message that names the action. */
function actionName(body: string): string {
  return (
    /action:\s*([^,\n]+)/.exec(body)?.[1]?.trim() ?? '(action not recognised)'
  );
}

describe('recordAdminAction', () => {
  it('finds the call sites, so the rules below are not vacuous', () => {
    expect(calls.length).toBeGreaterThan(20);
  });

  it('is given somewhere to write at every call site', () => {
    const unrecordable = calls
      .filter(
        (call) =>
          !hasTopLevelKey(call.body, 'organizationId') &&
          !hasTopLevelKey(call.body, 'securityEvent'),
      )
      .map((call) => `${relative(call.file)} — ${actionName(call.body)}`);

    expect(
      unrecordable,
      'These calls pass neither `organizationId` nor `securityEvent`, so ' +
        '`recordAdminAction` throws — at the end of a mutating action, after ' +
        'the write. Platform-scoped actions take ' +
        "`securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' }`; " +
        'organization-scoped ones take `organizationId`.',
    ).toEqual([]);
  });

  it('covers both destinations, so neither branch of the rule is untested', () => {
    const withOrg = calls.filter((call) =>
      hasTopLevelKey(call.body, 'organizationId'),
    );
    const withEvent = calls.filter((call) =>
      hasTopLevelKey(call.body, 'securityEvent'),
    );

    expect(withOrg.length).toBeGreaterThan(0);
    expect(withEvent.length).toBeGreaterThan(0);
  });
});
