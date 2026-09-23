import { describe, expect, it } from 'vitest';

import {
  BUNDLE_FORMAT_VERSION,
  bundleManifestSchema,
} from '../bundle-manifest';

const HASH = `sha256:${'b'.repeat(64)}`;
const A = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
const B = '7a2e3d4c-5b6f-4a71-9b8c-0d1e2f3a4b5c';

const valid = () => ({
  formatVersion: BUNDLE_FORMAT_VERSION,
  organizationId: 'org_1',
  generatedAt: '2026-09-23T12:00:00Z',
  chunking: 'predefined',
  graph: 'graph.json',
  pages: [
    { id: A, path: 'pages/onboarding-process.md', contentHash: HASH },
    { id: B, path: 'pages/leave-policy.md', contentHash: HASH },
  ],
});

describe('bundleManifestSchema', () => {
  it('accepts a two-page bundle', () => {
    expect(bundleManifestSchema.safeParse(valid()).success).toBe(true);
  });

  it('accepts an empty bundle — an organization with nothing approved yet', () => {
    expect(
      bundleManifestSchema.safeParse({ ...valid(), pages: [] }).success,
    ).toBe(true);
  });

  it('refuses a format version it does not know', () => {
    expect(
      bundleManifestSchema.safeParse({ ...valid(), formatVersion: 2 }).success,
    ).toBe(false);
  });

  // An importer that re-splits would cut a curated statement off from the
  // citation behind it.
  it('refuses any chunking but predefined', () => {
    expect(
      bundleManifestSchema.safeParse({ ...valid(), chunking: 'auto' }).success,
    ).toBe(false);
  });

  // A bundle comes back to us for import; a path out of it is the entry an
  // importer must never have to remember to refuse.
  it.each([
    '../secrets.md',
    'pages/../../.env.local.md',
    '/etc/passwd.md',
    'C:/pages/a.md',
    'pages\\a.md',
    'pages//a.md',
  ])('refuses the page path %j', (path) => {
    const manifest = valid();
    manifest.pages[0]!.path = path;
    expect(bundleManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('refuses a page that is not markdown', () => {
    const manifest = valid();
    manifest.pages[0]!.path = 'pages/a.html';
    expect(bundleManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('refuses a graph path outside the bundle', () => {
    expect(
      bundleManifestSchema.safeParse({ ...valid(), graph: '../graph.json' })
        .success,
    ).toBe(false);
  });

  it('refuses a page listed twice', () => {
    const manifest = valid();
    manifest.pages[1]!.id = A;
    expect(bundleManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('refuses two pages at one path', () => {
    const manifest = valid();
    manifest.pages[1]!.path = manifest.pages[0]!.path;
    expect(bundleManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('refuses a generatedAt that is not a timestamp', () => {
    expect(
      bundleManifestSchema.safeParse({ ...valid(), generatedAt: 'yesterday' })
        .success,
    ).toBe(false);
  });
});
