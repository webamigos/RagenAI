import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONNECTOR_METADATA,
  type ConnectorProvider,
} from '@ragenai/platform-contracts';
import { describe, expect, it } from 'vitest';

import {
  projectAuthType,
  projectBuiltInCatalogue,
  type BuiltInCatalogEntry,
} from '../built-in-projection';
import { PROVIDER_LIST } from '../registry';

/**
 * `prisma/catalog/built-in-connectors.json` is what the seed and the migration
 * write, and it is committed rather than computed because the manifests it
 * comes from cannot be imported by a seed runner: `shared-config.ts` reads
 * server URLs from `process.env` at module load, and the HubSpot and Slack
 * manifests read OAuth client ids and secrets the same way.
 *
 * That leaves the copy free to drift, so this is the thing that stops it. The
 * comparison belongs here, in CI, and not in the migration path.
 *
 * When it fails: `npm run connectors:projection --workspace @ragenai/web`.
 */

const PROJECTION = join(
  import.meta.dirname,
  '../../../../../../../prisma/catalog/built-in-connectors.json',
);

describe('the built-in connector projection', () => {
  const committed = JSON.parse(
    readFileSync(PROJECTION, 'utf8'),
  ) as BuiltInCatalogEntry[];

  it('matches the manifests it was generated from', () => {
    expect(committed).toEqual(projectBuiltInCatalogue());
  });

  it('agrees with CONNECTOR_METADATA on every label and brand asset', () => {
    for (const def of PROVIDER_LIST) {
      // `def.provider` is a slug now, so the lookup needs narrowing. Every
      // built-in still has a metadata entry; `every-seeded-connector-resolves`
      // is what will say so once the enum is gone.
      const metadata = CONNECTOR_METADATA[def.provider as ConnectorProvider];
      expect(metadata.label).toBe(def.name);
      expect(metadata.icon).toBe(
        committed.find((e) => e.slug === def.provider)?.icon,
      );
    }
  });

  it('treats a manifest with no authType as OAUTH, never SERVER_SIDE', () => {
    // The five Google entries carry no `authType` and reach `/auth/google` on
    // the MCP container through the popup — `ConnectorCard` falls through its
    // four branches to `authBaseUrl + authPath`.
    //
    // `server_side` is a different branch and means the opposite: the MCP
    // service already holds the credential, so the card skips the popup and
    // flips the connector straight to CONNECTED. Seeding these five that way
    // would have replaced their authorization with a row claiming they were
    // already authorized. Nothing branches on `'oauth'`, which is what makes
    // it behave exactly as `undefined` does.
    expect(projectAuthType(undefined)).toBe('OAUTH');
    expect(projectAuthType('external_mcp')).toBe('EXTERNAL_MCP');
    expect(projectAuthType('server_side')).toBe('SERVER_SIDE');
    expect(
      committed.filter((e) => e.authType === 'OAUTH').map((e) => e.slug),
    ).toEqual([
      'GOOGLE_CALENDAR',
      'GOOGLE_ANALYTICS',
      'GOOGLE_ADS',
      'GOOGLE_DRIVE',
      'GMAIL',
    ]);
    expect(committed.filter((e) => e.authType === 'SERVER_SIDE')).toEqual([]);
  });

  it('drops a system prompt that is a function, and keeps every string one', () => {
    for (const def of PROVIDER_LIST) {
      const row = committed.find((e) => e.slug === def.provider);
      if (typeof def.systemPromptFragment === 'function') {
        // Google Calendar's fragment takes the user's timezone. Rows hold
        // text; a fragment that must compute stays a behaviour pack in code,
        // and the row it seeds is deliberately incomplete without one.
        expect(row?.systemPrompt).toBeNull();
      } else {
        expect(row?.systemPrompt).toBe(def.systemPromptFragment ?? null);
      }
    }
  });

  it('carries no URL a deployment configures', () => {
    for (const entry of committed) {
      expect(Object.keys(entry)).not.toContain('mcpServerUrl');
      expect(Object.keys(entry)).not.toContain('authBaseUrl');
    }
  });
});
