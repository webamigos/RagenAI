// Knex connection is initialized at module load time. To avoid TDZ issues with
// jest.mock() hoisting, we declare mocks with `var` (JS-hoisted) so they are
// reachable inside the factory before `let`/`const` bindings are initialized.

/* eslint-disable no-var */
var mockFirst: jest.Mock;
var mockWhere: jest.Mock;
var mockSelect: jest.Mock;
var mockConnection: jest.Mock & { raw: jest.Mock };
/* eslint-enable no-var */

jest.mock('knex', () => {
  mockFirst = jest.fn();
  mockWhere = jest.fn().mockReturnValue({ first: mockFirst });
  mockSelect = jest.fn().mockReturnValue({ where: mockWhere });
  mockConnection = jest
    .fn()
    .mockReturnValue({ select: mockSelect }) as jest.Mock & {
    raw: jest.Mock;
  };
  mockConnection.raw = jest.fn();
  return {
    default: jest.fn(() => mockConnection),
    __esModule: true,
  };
});

import { db } from '../db';

describe('pii-settings DB queries', () => {
  beforeEach(() => {
    mockFirst.mockReset();
    mockWhere.mockReset();
    mockSelect.mockReset();
    mockConnection.mockReset();
    mockWhere.mockReturnValue({ first: mockFirst });
    mockSelect.mockReturnValue({ where: mockWhere });
    mockConnection.mockReturnValue({ select: mockSelect });
  });

  describe('getPiiIngestionMode', () => {
    it('returns destructive when no row exists', async () => {
      mockFirst.mockResolvedValue(undefined);
      const result = await db.getPiiIngestionMode('org-1');
      expect(result).toBe('destructive');
    });

    it('returns destructive when field is null', async () => {
      mockFirst.mockResolvedValue({ pii_ingestion_mode: null });
      const result = await db.getPiiIngestionMode('org-1');
      expect(result).toBe('destructive');
    });

    it('returns dual_content when set — and queries correct table and org', async () => {
      mockFirst.mockResolvedValue({ pii_ingestion_mode: 'dual_content' });
      const result = await db.getPiiIngestionMode('org-1');
      expect(result).toBe('dual_content');
      expect(mockConnection).toHaveBeenCalledWith('organization_settings');
      expect(mockWhere).toHaveBeenCalledWith({ organization_id: 'org-1' });
    });
  });

  describe('getEncryptedPiiDek', () => {
    it('returns null when no row exists', async () => {
      mockFirst.mockResolvedValue(undefined);
      const result = await db.getEncryptedPiiDek('org-1');
      expect(result).toBeNull();
    });

    it('returns encrypted_pii_dek string when present — and queries correct table and org', async () => {
      mockFirst.mockResolvedValue({ encrypted_pii_dek: 'enc-base64' });
      const result = await db.getEncryptedPiiDek('org-1');
      expect(result).toBe('enc-base64');
      expect(mockConnection).toHaveBeenCalledWith('organization_settings');
      expect(mockWhere).toHaveBeenCalledWith({ organization_id: 'org-1' });
    });

    it('returns null when encrypted_pii_dek is null', async () => {
      mockFirst.mockResolvedValue({ encrypted_pii_dek: null });
      const result = await db.getEncryptedPiiDek('org-1');
      expect(result).toBeNull();
    });
  });
});
