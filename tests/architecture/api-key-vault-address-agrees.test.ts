import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * An API key's secret is written by apps/web and destroyed by apps/admin, and
 * the two must address it identically.
 *
 * `createApiKeyCommand` stores it in ragen-token-vault under customer id
 * `api-key-<row id>` and provider `ragen-api-key`. The admin panel's revoke
 * derives the same pair from `apps/admin/src/lib/vault.ts`. Nothing in the
 * type system connects them — they are string literals in different
 * workspaces, one of them inside a template — so a rename on either side
 * typechecks, builds, and passes both apps' unit tests.
 *
 * The failure it would cause is the bad kind. Deleting a token that does not
 * exist is not an error at the vault, so a revoke against the wrong address
 * **reports success and leaves the secret in place**, and the panel would then
 * delete the `ApiKey` row — the only record naming that entry. An orphaned
 * live-looking secret, no row, no error, no log.
 *
 * Hence a test that reads both sources as text. It cannot be expressed any
 * other way from here: apps/admin does not import apps/web.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const WEB_COMMAND = join(
  REPO_ROOT,
  'apps/web/src/features/organizations/services/commands/create-api-key-command.ts',
);
const ADMIN_BINDING = join(REPO_ROOT, 'apps/admin/src/lib/vault.ts');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('the API key vault address', () => {
  it('uses the same provider on both sides', () => {
    const web = read(WEB_COMMAND).match(
      /const VAULT_PROVIDER = '([^']+)'/,
    )?.[1];
    const admin = read(ADMIN_BINDING).match(
      /API_KEY_VAULT_PROVIDER = '([^']+)'/,
    )?.[1];

    expect(web, 'apps/web no longer declares VAULT_PROVIDER').toBeTruthy();
    expect(
      admin,
      'apps/admin no longer declares API_KEY_VAULT_PROVIDER',
    ).toBeTruthy();
    expect(admin).toBe(web);
  });

  it('uses the same customer-id prefix on both sides', () => {
    // apps/web builds it inline, twice: once on create and once on the
    // cleanup path. Both read `api-key-${apiKey.id}`.
    const webPrefixes = [
      ...read(WEB_COMMAND).matchAll(/`([a-z-]+)-\$\{apiKey\.id\}`/g),
    ].map((match) => match[1]);
    const adminPrefix = read(ADMIN_BINDING).match(
      /return `([a-z-]+)-\$\{apiKeyId\}`/,
    )?.[1];

    expect(
      webPrefixes.length,
      'apps/web no longer builds an api-key vault customer id inline',
    ).toBeGreaterThan(0);
    expect(adminPrefix, 'apps/admin no longer builds one').toBeTruthy();

    // Every occurrence, not just the first: the create path and its rollback
    // must agree with each other as well as with the panel.
    for (const prefix of webPrefixes) {
      expect(prefix).toBe(adminPrefix);
    }
  });
});
