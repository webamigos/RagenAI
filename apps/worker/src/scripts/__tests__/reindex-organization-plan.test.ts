import { describe, expect, it } from 'vitest';

import { reindexStepFor } from '../reindex-for-context-plan.js';
import {
  brainRepublishWhere,
  fullReindexWhere,
  parseFullReindexArgs,
  renderOrgPlan,
} from '../reindex-organization-plan.js';

describe('parseFullReindexArgs', () => {
  it('needs exactly one of --org and --all-orgs', () => {
    expect(() => parseFullReindexArgs(['--dry-run'])).toThrow('--all-orgs');
    expect(() => parseFullReindexArgs(['--org', 'o-1', '--all-orgs'])).toThrow(
      'not both',
    );
    expect(() => parseFullReindexArgs(['--org'])).toThrow(
      '--org needs a value',
    );
  });

  // An unset shell variable: `--org "$ORG"`.
  it('refuses an empty organization id', () => {
    for (const empty of ['', '  ']) {
      expect(() => parseFullReindexArgs(['--org', empty])).toThrow(
        'not an empty value',
      );
    }
  });

  // A cutoff still ahead never lets a re-indexed file leave the selection.
  it('refuses a cutoff in the future', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    expect(() =>
      parseFullReindexArgs(
        ['--all-orgs', '--before', '2026-11-19T12:00:01Z'],
        now,
      ),
    ).toThrow('must not be in the future');
    expect(
      parseFullReindexArgs(
        ['--all-orgs', '--before', '2026-11-19T12:00:00Z'],
        now,
      ).before,
    ).toEqual(now);
  });

  it('reads one organization, or all of them', () => {
    expect(parseFullReindexArgs(['--org', 'o-1'])).toEqual({
      orgId: 'o-1',
      allOrgs: false,
      dryRun: false,
      limit: Infinity,
      before: null,
    });
    expect(parseFullReindexArgs(['--all-orgs', '--dry-run'])).toMatchObject({
      orgId: null,
      allOrgs: true,
      dryRun: true,
    });
  });

  it('reads the cutoff as a moment', () => {
    const { before } = parseFullReindexArgs([
      '--all-orgs',
      '--before',
      '2026-11-19T01:00:00Z',
    ]);
    expect(before?.toISOString()).toBe('2026-11-19T01:00:00.000Z');
    expect(() =>
      parseFullReindexArgs(['--all-orgs', '--before', 'yesterday']),
    ).toThrow('--before must be a date');
  });

  it('refuses a limit that is not a positive whole number', () => {
    for (const limit of ['0', '2.5', 'ten']) {
      expect(() =>
        parseFullReindexArgs(['--all-orgs', '--dry-run', '--limit', limit]),
      ).toThrow('--limit');
    }
  });

  // Without a fixed cutoff, batch two re-selects what batch one just
  // re-indexed: those files are COMPLETED again, and "before this run" has
  // moved past them.
  it('refuses a batch with no fixed cutoff', () => {
    expect(() => parseFullReindexArgs(['--all-orgs', '--limit', '50'])).toThrow(
      '--limit needs --before',
    );
    expect(
      parseFullReindexArgs([
        '--all-orgs',
        '--limit',
        '50',
        '--before',
        '2026-11-19T01:00:00Z',
      ]).limit,
    ).toBe(50);
  });

  it('lets a dry run preview a batch without a cutoff', () => {
    expect(
      parseFullReindexArgs(['--all-orgs', '--limit', '50', '--dry-run']).limit,
    ).toBe(50);
  });
});

describe('fullReindexWhere', () => {
  const before = new Date('2026-11-19T01:00:00Z');
  const where = fullReindexWhere('org-1', before);

  it('is scoped to the organization', () => {
    expect(where.organizationId).toBe('org-1');
  });

  it('takes only files the index held', () => {
    expect(where.embeddingStatus).toBe('COMPLETED');
  });

  it('skips what this re-index already did, and takes rows with no timestamp', () => {
    expect(where.OR).toEqual([
      { embeddingCompletedAt: null },
      { embeddingCompletedAt: { lt: before } },
    ]);
  });

  it('leaves imports and published Brain pages alone', () => {
    expect(where.sourceFileId).toBeNull();
    expect(where.publishedPages).toEqual({ none: {} });
  });
});

describe('brainRepublishWhere', () => {
  const before = new Date('2026-11-19T01:00:00Z');
  const where = brainRepublishWhere('org-1', before);

  it('is scoped to the organization, on the page and on its file', () => {
    expect(where.organizationId).toBe('org-1');
    expect(where.publishedFile.is.organizationId).toBe('org-1');
  });

  // A withdrawn page must come back only through publish.
  it('takes only pages that are published now', () => {
    expect(where.publishedAt).toEqual({ not: null });
  });

  it('takes a page whose file was written before the cutoff, and is not mid-write', () => {
    expect(where.publishedFile.is.embeddingStatus).toBe('COMPLETED');
    expect(where.publishedFile.is.OR).toEqual([
      { embeddingCompletedAt: null },
      { embeddingCompletedAt: { lt: before } },
    ]);
  });
});

describe('reindexStepFor', () => {
  const file = {
    id: 'f-1',
    fileName: 'policy.pdf',
    projectId: null,
    documentId: 'd-1',
  };

  it('re-ingests a file whose active version is the upload', () => {
    expect(reindexStepFor({ ...file, activeChangeType: 'UPLOAD' })).toEqual({
      fileId: 'f-1',
      job: 'runFileEmbeddings',
    });
    expect(
      reindexStepFor({ ...file, documentId: null, activeChangeType: null }),
    ).toEqual({ fileId: 'f-1', job: 'runFileEmbeddings' });
  });

  // Re-parsing the stored upload would put the original text back in search.
  it.each(['EDIT', 'OPTIMIZATION', 'ROLLBACK'])(
    'embeds the version text when the active version is %s',
    (activeChangeType) => {
      expect(reindexStepFor({ ...file, activeChangeType })).toEqual({
        fileId: 'f-1',
        job: 'reindexDocumentVersion',
        fileName: 'policy.pdf',
        projectId: null,
        documentId: 'd-1',
      });
    },
  );
});

describe('renderOrgPlan', () => {
  const steps = [
    { job: 'runFileEmbeddings' },
    { job: 'runFileEmbeddings' },
    { job: 'reindexDocumentVersion' },
  ];

  it('counts each job', () => {
    expect(
      renderOrgPlan({
        orgId: 'org-1',
        steps,
        remaining: 0,
        brainPages: 0,
        dryRun: true,
      }),
    ).toBe('org-1: would start 3 (2 re-ingest, 1 from an edited version)');
  });

  it('says what is left past the limit, and what it does not cover', () => {
    const line = renderOrgPlan({
      orgId: 'org-1',
      steps,
      remaining: 40,
      brainPages: 1,
      dryRun: false,
    });
    expect(line).toContain('starting 3');
    expect(line).toContain('40 more past --limit');
    expect(line).toContain('; 1 published Brain page');
  });
});
