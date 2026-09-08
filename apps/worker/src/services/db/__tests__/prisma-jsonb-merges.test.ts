// The three JSONB merges migrated in ADR-40 step 3b. They stay in SQL, so what
// is worth asserting is the SQL itself: that each statement merges rather than
// overwrites, seeds a NULL column instead of nulling it, and carries its org
// filter.
//
// `$executeRaw` is a tagged template, so the mock receives the string fragments
// and the interpolated values separately — which is also the proof that the
// values are parameters rather than concatenated into the statement.

/* eslint-disable no-var */
var mockExecuteRaw: jest.Mock;
/* eslint-enable no-var */

jest.mock('../prisma', () => {
  mockExecuteRaw = jest.fn().mockResolvedValue(1);
  return { getPrisma: () => ({ $executeRaw: mockExecuteRaw }) };
});

import { db } from '../db';

/** The statement as Postgres would see it, with `$1`, `$2` … for the values. */
function statement(): string {
  const [fragments] = mockExecuteRaw.mock.calls[0] as [string[]];
  return fragments
    .map((f, i) => (i === fragments.length - 1 ? f : `${f}$${i + 1}`))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function values(): unknown[] {
  return (mockExecuteRaw.mock.calls[0] as unknown[]).slice(1);
}

beforeEach(() => {
  mockExecuteRaw.mockClear();
  mockExecuteRaw.mockResolvedValue(1);
});

describe('mergeFileMetadata', () => {
  const call = () =>
    db.mergeFileMetadata({
      where: { fileId: 'file-1', orgId: 'org-1' },
      patch: { language: 'pl' },
    });

  it('merges into the existing column rather than replacing it', async () => {
    await call();

    expect(statement()).toContain(
      "metadata = COALESCE(metadata, '{}'::jsonb) ||",
    );
  });

  // `||` against NULL yields NULL, which would wipe a column that had never
  // been set instead of seeding it.
  it('seeds a null column instead of nulling it', async () => {
    await call();

    expect(statement()).toContain("COALESCE(metadata, '{}'::jsonb)");
  });

  it('scopes the update to the file and the org', async () => {
    await call();

    expect(statement()).toMatch(
      /WHERE id = \$\d+::uuid AND organization_id = \$\d+/,
    );
  });

  it('passes the patch and the ids as parameters, not as SQL text', async () => {
    await call();

    expect(values()).toEqual([
      JSON.stringify({ language: 'pl' }),
      'file-1',
      'org-1',
    ]);
  });

  it('returns the row count the statement reports', async () => {
    mockExecuteRaw.mockResolvedValue(1);

    await expect(call()).resolves.toBe(1);
  });
});

describe('updateOptimizationJobFields', () => {
  const call = () =>
    db.updateOptimizationJobFields({
      documentId: 'doc-1',
      orgId: 'org-1',
      fields: { status: 'done' },
    });

  // The whole point of this one: patch the scalars beside `suggestions`
  // without touching the array, so a user can still act on the previous run's
  // suggestions while a new one is in flight.
  it('patches inside optimizationJob rather than replacing metadata', async () => {
    await call();

    const sql = statement();
    expect(sql).toContain('jsonb_set(');
    expect(sql).toContain("'{optimizationJob}'");
    expect(sql).toContain(
      "COALESCE(metadata->'optimizationJob', '{}'::jsonb) ||",
    );
  });

  it('never names suggestions, so the array is left alone', async () => {
    await call();

    expect(statement()).not.toContain('suggestions');
  });

  it('scopes the update to the document and the org', async () => {
    await call();

    expect(statement()).toMatch(
      /WHERE id = \$\d+::uuid AND organization_id = \$\d+/,
    );
  });
});
