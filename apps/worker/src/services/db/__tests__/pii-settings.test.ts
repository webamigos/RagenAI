// These two functions moved from knex to Prisma in ADR-40 step 2, so the test
// mocks the Prisma client rather than a knex query builder. The assertions are
// the same ones as before: what the functions return for a missing row, a null
// column and a set value, plus that the read is scoped to the org.
//
// `var` for the mocks: `jest.mock` factories are hoisted above `let`/`const`
// initialisation, same reason as the other tests in this directory.

/* eslint-disable no-var */
var mockFindUnique: jest.Mock;
/* eslint-enable no-var */

jest.mock('../prisma', () => {
  mockFindUnique = jest.fn();
  return {
    getPrisma: () => ({
      organizationSettings: { findUnique: mockFindUnique },
    }),
  };
});

import { db } from '../db';

describe('pii-settings DB queries', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  describe('getPiiIngestionMode', () => {
    it('returns destructive when no row exists', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(db.getPiiIngestionMode('org-1')).resolves.toBe(
        'destructive',
      );
    });

    it('returns destructive when the column is null', async () => {
      mockFindUnique.mockResolvedValue({ piiIngestionMode: null });

      await expect(db.getPiiIngestionMode('org-1')).resolves.toBe(
        'destructive',
      );
    });

    // Anything that is not exactly 'dual_content' has to fall back, because
    // the column is a free-text String in the schema, not an enum.
    it('returns destructive for an unrecognised value', async () => {
      mockFindUnique.mockResolvedValue({ piiIngestionMode: 'something-else' });

      await expect(db.getPiiIngestionMode('org-1')).resolves.toBe(
        'destructive',
      );
    });

    it('returns dual_content when set, reading only that column for that org', async () => {
      mockFindUnique.mockResolvedValue({ piiIngestionMode: 'dual_content' });

      await expect(db.getPiiIngestionMode('org-1')).resolves.toBe(
        'dual_content',
      );
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        select: { piiIngestionMode: true },
      });
    });
  });

  describe('getEncryptedPiiDek', () => {
    it('returns null when no row exists', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(db.getEncryptedPiiDek('org-1')).resolves.toBeNull();
    });

    it('returns the encrypted DEK when present, scoped to the org', async () => {
      mockFindUnique.mockResolvedValue({ encryptedPiiDek: 'enc-base64' });

      await expect(db.getEncryptedPiiDek('org-1')).resolves.toBe('enc-base64');
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        select: { encryptedPiiDek: true },
      });
    });

    it('returns null when the column is null', async () => {
      mockFindUnique.mockResolvedValue({ encryptedPiiDek: null });

      await expect(db.getEncryptedPiiDek('org-1')).resolves.toBeNull();
    });
  });
});
