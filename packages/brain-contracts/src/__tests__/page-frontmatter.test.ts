import { describe, expect, it } from 'vitest';

import { pageFrontmatterSchema } from '../page-frontmatter';

const HASH = `sha256:${'a'.repeat(64)}`;
const PAGE_ID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';

const valid = () => ({
  id: PAGE_ID,
  slug: 'onboarding-process',
  title: 'Onboarding',
  type: 'PROCESS',
  status: 'APPROVED',
  owner: 'usr_1',
  accessibleBy: ['team:hr', 'team:board'],
  validFrom: '2026-03-01',
  supersededBy: null,
  verifyEvery: 'P3M',
  lastVerifiedAt: '2026-09-16T10:00:00+02:00',
  lastVerifiedBy: 'usr_1',
  contentHash: HASH,
  sources: [
    {
      fileId: '0b8e7a2c-1d3f-4e5a-9b6c-7d8e9f0a1b2c',
      documentVersionId: '1c9f8b3d-2e4a-4f6b-8c7d-8e9f0a1b2c3d',
      span: 'p.4 §2',
      hash: HASH,
    },
  ],
});

describe('pageFrontmatterSchema', () => {
  it('accepts the page the research sketches', () => {
    const parsed = pageFrontmatterSchema.parse(valid());
    expect(parsed.sources[0]!.sourceDeletedAt).toBeNull();
  });

  it('fills the optional temporal fields with null, not undefined', () => {
    const {
      validFrom: _v,
      supersededBy: _s,
      verifyEvery: _e,
      lastVerifiedAt: _a,
      lastVerifiedBy: _b,
      ...rest
    } = valid();
    const parsed = pageFrontmatterSchema.parse(rest);
    expect(parsed).toMatchObject({
      validFrom: null,
      supersededBy: null,
      verifyEvery: null,
      lastVerifiedAt: null,
      lastVerifiedBy: null,
    });
  });

  // D7: a page nobody vouches for does not leave Postgres. An empty owner that
  // the consumer is meant to notice is the flag the spec says not to build.
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['blank', '   '],
  ])('refuses a %s owner', (_label, owner) => {
    expect(pageFrontmatterSchema.safeParse({ ...valid(), owner }).success).toBe(
      false,
    );
  });

  it('refuses an empty accessibleBy — nobody decided that', () => {
    expect(
      pageFrontmatterSchema.safeParse({ ...valid(), accessibleBy: [] }).success,
    ).toBe(false);
  });

  // Retrieval matches principals as exact strings, so a malformed one does not
  // fail: it matches nobody while the page claims to be shared.
  it.each(['group:hr', 'team :hr', 'team:', 'hr', 'team:h r', 'team:a:b'])(
    'refuses the principal %j',
    (principal) => {
      expect(
        pageFrontmatterSchema.safeParse({
          ...valid(),
          accessibleBy: [principal],
        }).success,
      ).toBe(false);
    },
  );

  it('refuses a principal listed twice', () => {
    expect(
      pageFrontmatterSchema.safeParse({
        ...valid(),
        accessibleBy: ['team:hr', 'team:hr'],
      }).success,
    ).toBe(false);
  });

  it.each(['CANDIDATE', 'REJECTED', 'approved'])(
    'refuses the status %s in an export',
    (status) => {
      expect(
        pageFrontmatterSchema.safeParse({ ...valid(), status }).success,
      ).toBe(false);
    },
  );

  it('exports a stale page, because that is the finding', () => {
    expect(
      pageFrontmatterSchema.safeParse({ ...valid(), status: 'STALE' }).success,
    ).toBe(true);
  });

  it('refuses a page with no source', () => {
    expect(
      pageFrontmatterSchema.safeParse({ ...valid(), sources: [] }).success,
    ).toBe(false);
  });

  it('refuses a source without the version the curator read', () => {
    const page = valid();
    const { documentVersionId: _d, ...source } = page.sources[0]!;
    expect(
      pageFrontmatterSchema.safeParse({ ...page, sources: [source] }).success,
    ).toBe(false);
  });

  it('keeps a deleted source, with the time it went', () => {
    const page = valid();
    const parsed = pageFrontmatterSchema.parse({
      ...page,
      sources: [
        { ...page.sources[0]!, sourceDeletedAt: '2026-09-20T08:00:00Z' },
      ],
    });
    expect(parsed.sources[0]!.sourceDeletedAt).toBe('2026-09-20T08:00:00Z');
  });

  it.each([
    ['set without a verifier', { lastVerifiedBy: null }],
    ['a verifier without a time', { lastVerifiedAt: null }],
  ])('refuses verification %s', (_label, patch) => {
    expect(
      pageFrontmatterSchema.safeParse({ ...valid(), ...patch }).success,
    ).toBe(false);
  });

  it('refuses a page that supersedes itself', () => {
    expect(
      pageFrontmatterSchema.safeParse({ ...valid(), supersededBy: PAGE_ID })
        .success,
    ).toBe(false);
  });

  it.each(['P3M', 'P1Y', 'P2W', 'PT12H', 'P1DT2H'])(
    'accepts the duration %s',
    (verifyEvery) => {
      expect(
        pageFrontmatterSchema.safeParse({ ...valid(), verifyEvery }).success,
      ).toBe(true);
    },
  );

  it.each(['P', 'PT', '3M', 'quarterly', 'P3'])(
    'refuses the duration %j',
    (verifyEvery) => {
      expect(
        pageFrontmatterSchema.safeParse({ ...valid(), verifyEvery }).success,
      ).toBe(false);
    },
  );

  it.each(['Onboarding', 'on boarding', 'onboarding-', '-onboarding', 'a--b'])(
    'refuses the slug %j',
    (slug) => {
      expect(
        pageFrontmatterSchema.safeParse({ ...valid(), slug }).success,
      ).toBe(false);
    },
  );

  it.each(['sha1:abc', `sha256:${'A'.repeat(64)}`, `sha256:${'a'.repeat(63)}`])(
    'refuses the hash %j',
    (contentHash) => {
      expect(
        pageFrontmatterSchema.safeParse({ ...valid(), contentHash }).success,
      ).toBe(false);
    },
  );

  it('refuses a type the schema does not have', () => {
    expect(
      pageFrontmatterSchema.safeParse({ ...valid(), type: 'process' }).success,
    ).toBe(false);
  });
});
