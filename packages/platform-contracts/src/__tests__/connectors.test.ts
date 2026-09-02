import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  CONNECTOR_ICON_PATHS,
  CONNECTOR_LIST,
  CONNECTOR_METADATA,
  CONNECTOR_PROVIDERS,
  isConnectorProvider,
} from '../connectors/connectors';

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
);

/**
 * `prisma/schema.prisma` decides which connectors exist. A value here that the
 * enum does not have can never match a real `McpConnector.provider` row; an
 * enum member missing here has no label, no icon, and cannot be allowlisted.
 *
 * Each app also assigns this map into a `Record<McpConnectorProvider, …>`
 * typed by its own generated enum, so a missing member fails typecheck at the
 * binding site. This test covers the other direction — an extra key here,
 * which such an assignment accepts silently.
 */
describe('against the McpConnectorProvider enum', () => {
  const schema = readFileSync(
    path.join(REPO_ROOT, 'prisma/schema.prisma'),
    'utf8',
  );

  const members = (
    schema.match(/enum McpConnectorProvider \{([^}]*)\}/)?.[1] ?? ''
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));

  it('found the enum, so this is not passing on an empty comparison', () => {
    expect(members.length).toBeGreaterThan(3);
  });

  it('covers exactly the enum members', () => {
    expect([...CONNECTOR_PROVIDERS].sort()).toEqual([...members].sort());
  });
});

describe('every connector', () => {
  it.each(CONNECTOR_PROVIDERS)('%s has a label and an icon', (provider) => {
    const entry = CONNECTOR_METADATA[provider];
    expect(entry.label.trim()).not.toBe('');
    expect(entry.icon).toMatch(/^\/assets\/connectors\/[a-z0-9-]+\.svg$/);
  });

  // The `value` is what gets written to `allowedConnectors`, so a key/value
  // mismatch would store one connector under another's name.
  it.each(CONNECTOR_PROVIDERS)('%s keys its own entry', (provider) => {
    expect(CONNECTOR_METADATA[provider].value).toBe(provider);
  });

  it('has a distinct icon', () => {
    const icons = CONNECTOR_PROVIDERS.map((p) => CONNECTOR_METADATA[p].icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('has a distinct label', () => {
    const labels = CONNECTOR_PROVIDERS.map((p) => CONNECTOR_METADATA[p].label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  // Both apps render `<img src={icon}>` against their own `public/`, so an
  // asset present in one and absent in the other is a broken image in that
  // app only — invisible to whoever is looking at the other one.
  it.each(['apps/web/public', 'apps/admin/public'])(
    'ships the SVG under %s',
    (publicDir) => {
      const missing = CONNECTOR_PROVIDERS.filter((p) => {
        try {
          readFileSync(
            path.join(REPO_ROOT, publicDir, CONNECTOR_METADATA[p].icon),
          );
          return false;
        } catch {
          return true;
        }
      });

      expect(missing).toEqual([]);
    },
  );
});

describe('derived views', () => {
  it('maps every provider to its icon', () => {
    expect(Object.keys(CONNECTOR_ICON_PATHS).sort()).toEqual(
      [...CONNECTOR_PROVIDERS].sort(),
    );
  });

  it('lists every provider once, in schema order', () => {
    expect(CONNECTOR_LIST.map((c) => c.value)).toEqual([
      ...CONNECTOR_PROVIDERS,
    ]);
  });
});

describe('isConnectorProvider', () => {
  it('accepts a real provider', () => {
    expect(isConnectorProvider('SLACK')).toBe(true);
  });

  it.each([
    ['a lower-case spelling', 'slack'],
    ['an unknown provider', 'NOTION'],
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
  ])('rejects %s', (_label, value) => {
    expect(isConnectorProvider(value)).toBe(false);
  });
});
