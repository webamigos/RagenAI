import { pageFrontmatterSchema } from '@ragenai/brain-contracts';
import { buildBundle, type BundlePageInput } from '@ragenai/brain-core';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * A bundle never lets anyone read a page they could not read in Ragen
 * (spec E6, "The permission rule, stated once").
 *
 * The rule is simple and the way to break it is quiet: an exporter that
 * "helpfully" filled an empty `accessibleBy` with the organization, merged a
 * page's list with its sources', or rounded a list up would produce a valid
 * bundle, and nothing else in the repository would notice. So this is a
 * property over many random pages rather than one example: for every page
 * that is exported, its frontmatter lists exactly the principals the page
 * has — no more, no fewer — and a page with none is not exported at all.
 */
const PRINCIPALS = ['org:org-1', 'team:hr', 'team:it', 'user:anna', 'user:bob'];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('Brain export never widens access', () => {
  it('copies each exported page’s principals exactly, and exports none with no principals', () => {
    const random = rng(42);
    const pages: BundlePageInput[] = Array.from({ length: 300 }, (_, i) => {
      const accessibleBy = PRINCIPALS.filter(() => random() < 0.3);
      return {
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        slug: `p-${i}`,
        title: `P ${i}`,
        type: 'ENTITY',
        status: random() < 0.8 ? 'APPROVED' : 'CANDIDATE',
        content: `# P ${i}\n`,
        contentHash: `sha256:${'c'.repeat(64)}`,
        owner: random() < 0.9 ? 'owner@example.com' : null,
        accessibleBy,
        validFrom: null,
        supersededBy: null,
        verifyEvery: null,
        lastVerifiedAt: null,
        lastVerifiedBy: null,
        sources: [
          {
            fileId: '00000000-0000-4000-8000-00000000f11e',
            documentVersionId: '00000000-0000-4000-8000-00000000ae51',
            span: '§1',
            quote: 'q',
            hash: `sha256:${'d'.repeat(64)}`,
            sourceDeletedAt: null,
          },
        ],
      };
    });

    const bundle = buildBundle({
      organizationId: 'org-1',
      generatedAt: new Date(),
      pages,
      edges: [],
    });
    const byId = new Map(pages.map((p) => [p.id, p]));
    expect(bundle.manifest.pages.length).toBeGreaterThan(50);

    for (const entry of bundle.manifest.pages) {
      const file = bundle.files.get(entry.path)!;
      const front = pageFrontmatterSchema.parse(parse(file.split('---\n')[1]!));
      const source = byId.get(front.id)!;
      expect(source.accessibleBy.length).toBeGreaterThan(0);
      expect([...front.accessibleBy].sort()).toEqual(
        [...source.accessibleBy].sort(),
      );
    }
    for (const page of pages.filter((p) => p.accessibleBy.length === 0)) {
      expect(bundle.manifest.pages.some((e) => e.id === page.id)).toBe(false);
    }
  });
});
