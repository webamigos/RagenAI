import {
  bundleManifestSchema,
  knowledgeGraphSchema,
  pageFrontmatterSchema,
} from '@ragenai/brain-contracts';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { buildBundle, type BundlePageInput } from '../build-bundle';

const id = (n: number) =>
  `e2e00000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const page = (
  n: number,
  over: Partial<BundlePageInput> = {},
): BundlePageInput => ({
  id: id(n),
  slug: `strona-${n}`,
  title: `Strona ${n}`,
  type: 'POLICY',
  status: 'APPROVED',
  content: `# Strona ${n}\n\n- Coś [1]\n`,
  contentHash: `sha256:${'a'.repeat(64)}`,
  owner: 'anna@example.com',
  accessibleBy: ['team:hr'],
  validFrom: null,
  supersededBy: null,
  verifyEvery: 'P3M',
  lastVerifiedAt: null,
  lastVerifiedBy: null,
  sources: [
    {
      fileId: id(100),
      documentVersionId: id(200),
      span: '§1',
      quote: 'Coś',
      hash: `sha256:${'b'.repeat(64)}`,
      sourceDeletedAt: null,
    },
  ],
  ...over,
});

const frontmatterOf = (file: string) =>
  pageFrontmatterSchema.parse(parse(file.split('---\n')[1]!));

describe('buildBundle', () => {
  const bundle = buildBundle({
    organizationId: 'org-1',
    generatedAt: new Date('2026-09-24T00:00:00Z'),
    pages: [
      page(1),
      page(2, { status: 'STALE' }),
      page(3, { status: 'CANDIDATE' }),
      page(4, { owner: null }),
      page(5, { accessibleBy: [] }),
      page(6, { sources: [] }),
      page(7, { slug: 'strona-1' }),
    ],
    edges: [
      {
        from: id(1),
        to: id(2),
        kind: 'dotyczy',
        origin: 'EXTRACTED',
        confidence: null,
      },
      {
        from: id(1),
        to: id(3),
        kind: 'dotyczy',
        origin: 'EXTRACTED',
        confidence: null,
      },
    ],
  });

  it('exports approved and stale pages someone vouches for, and says why the rest stayed', () => {
    expect(bundle.manifest.pages.map((p) => p.id).sort()).toEqual([
      id(1),
      id(2),
      id(7),
    ]);
    expect(bundle.skipped.map((s) => [s.id, s.reason])).toEqual([
      [id(3), 'not-approved'],
      [id(4), 'no-owner'],
      [id(5), 'no-access'],
      [id(6), 'no-sources'],
    ]);
  });

  it('writes markdown with contract-valid frontmatter, and never two pages to one path', () => {
    const paths = bundle.manifest.pages.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('pages/strona-1.md');
    expect(paths).toContain('pages/strona-1-2.md');
    const first = bundle.files.get('pages/strona-1.md')!;
    expect(frontmatterOf(first)).toMatchObject({
      id: id(1),
      accessibleBy: ['team:hr'],
    });
    expect(first).toContain('# Strona 1');
  });

  it('draws the graph over exported pages only', () => {
    const graph = knowledgeGraphSchema.parse(
      JSON.parse(bundle.files.get('graph.json')!),
    );
    expect(graph.nodes.map((n) => n.id).sort()).toEqual([id(1), id(2), id(7)]);
    expect(graph.edges).toHaveLength(1);
  });

  it('writes a manifest an importer accepts', () => {
    expect(() =>
      bundleManifestSchema.parse(
        JSON.parse(bundle.files.get('manifest.json')!),
      ),
    ).not.toThrow();
  });
});
