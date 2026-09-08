import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Registration is closed where the user row is created, not where the form is
 * rendered — because there is more than one door.
 *
 * `emailAndPassword` sign-up is the obvious one. `magicLink` is the other, and
 * it is configured with `disableSignUp: false`, which means a magic link
 * requested for an address with no account **creates that account**. Gate the
 * sign-up form alone and that door stays wide open behind a UI that says
 * closed — the worst shape a security control can take, because it looks
 * enforced.
 *
 * Creating the user row is the one step both doors share, so
 * `databaseHooks.user.create.before` is the chokepoint. A provider added later
 * inherits the check instead of needing its own flag, which is the property
 * worth protecting: the next person to add an OAuth provider will not think
 * about registration at all.
 *
 * The sign-up page and the sign-in link also ask, but only to decide what to
 * render. They are not the control, and this test does not let them become it.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const AUTH = join('apps', 'web', 'src', 'lib', 'auth.ts');

function authSource(): string {
  return readFileSync(join(REPO_ROOT, AUTH), 'utf8');
}

/** The `databaseHooks.user.create` block, so `before` is read in context. */
function userCreateHook(source: string): string {
  const start = source.indexOf('databaseHooks:');
  expect(start, `${AUTH} no longer declares databaseHooks`).toBeGreaterThan(-1);

  const createAt = source.indexOf('create:', start);
  expect(createAt, 'databaseHooks declares no user.create').toBeGreaterThan(-1);

  const afterAt = source.indexOf('after:', createAt);
  return source.slice(createAt, afterAt === -1 ? undefined : afterAt);
}

describe('registration is closed at the user row', () => {
  const source = authSource();

  it('reads the file it is meant to police', () => {
    // Guard on the guard: a moved or renamed auth.ts would otherwise make
    // every assertion below pass over an empty string.
    expect(source.length).toBeGreaterThan(1_000);
    expect(source).toContain('betterAuth(');
  });

  it('runs a create.before hook on the user model', () => {
    expect(
      userCreateHook(source),
      'Without a `before` on user.create there is nothing standing between a ' +
        'magic link for an unknown address and a new account.',
    ).toContain('before:');
  });

  it('asks whether registration is open, inside that hook', () => {
    const hook = userCreateHook(source);

    expect(hook).toMatch(/isRegistrationOpen\s*\(/);
  });

  it('exempts a pending invitation, inside that hook', () => {
    // Closing registration must not break invitations an administrator has
    // already sent — the decision this feature was built around.
    const hook = userCreateHook(source);

    expect(hook).toMatch(/hasPendingInvitation\s*\(/);
  });

  it('refuses by throwing, so the caller gets a status and not a null user', () => {
    // Better Auth reads `return false` from create.before as "skip the
    // create" and hands the caller a null user, which surfaces as an opaque
    // failure. See node_modules/better-auth/dist/db/with-hooks.mjs.
    const hook = userCreateHook(source);

    expect(hook).toMatch(/throw new APIError\(/);
    expect(hook).not.toMatch(/return false/);
  });

  it('does not lean on the magic-link plugin flag instead', () => {
    // If someone flips this to `true` believing it closes registration, the
    // email-and-password door is unaffected and invited users lose magic-link
    // sign-in. The hook covers both; the flag covers neither properly.
    expect(source).toMatch(/disableSignUp:\s*false/);
  });
});
