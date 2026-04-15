import { beforeEach, describe, expect, it, vi } from 'vitest';
import { upsertRejestrioLeadCommand } from '../upsert-rejestrio-lead-command';

// Mock the Prisma singleton — we're testing parsing + which fields
// flow through to upsert, not Prisma itself.
type UpsertArgs = {
  where: { organizationId_krs: { organizationId: string; krs: number } };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};
const upsertMock = vi.fn<(args: UpsertArgs) => Promise<unknown>>(
  async () => ({}),
);
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    rejestrioLead: {
      upsert: (args: UpsertArgs) => upsertMock(args),
    },
  },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('upsertRejestrioLeadCommand', () => {
  beforeEach(() => {
    upsertMock.mockClear();
  });

  it('upserts from rejestrio__get_krs_info with ostatnie_sprawozdanie snapshot', async () => {
    const result = {
      success: true,
      krs: 634215,
      nip: '1132916831',
      nazwaPelna: 'EXAMPLE SP. Z O.O.',
      pkdGlowny: 'Działalność prawnicza',
      formaPrawna: 'SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
      stan: {
        wykreslona: false,
        wUpadlosci: false,
        wLikwidacji: false,
        naGpw: false,
      },
      ostatnieSprawozdanie: {
        rocznik: 2024,
        przychody: 3029247.85,
        zysk: 92707.38,
      },
    };

    await upsertRejestrioLeadCommand({
      organizationId: 'org-1',
      toolName: 'rejestrio__get_krs_info',
      result,
    });

    expect(upsertMock).toHaveBeenCalledOnce();
    const call = upsertMock.mock.calls[0][0];
    expect(call.where.organizationId_krs).toEqual({
      organizationId: 'org-1',
      krs: 634215,
    });
    expect(call.create.nip).toBe('1132916831');
    expect(call.create.companyName).toBe('EXAMPLE SP. Z O.O.');
    expect(call.create.revenueLast).toBe(3029247.85);
    expect(call.create.profitLast).toBe(92707.38);
    expect(call.create.revenueRocznik).toBe(2024);
    expect(call.create.enrichmentSource).toBe('rejestrio');
  });

  it('handles null ostatnieSprawozdanie (Orlen / consolidated filer)', async () => {
    const result = {
      success: true,
      krs: 10681,
      nip: '5260250995',
      nazwaPelna: 'ORLEN S.A.',
      pkdGlowny: 'Telekomunikacja',
      formaPrawna: 'SPÓŁKA AKCYJNA',
      stan: {
        wykreslona: false,
        wUpadlosci: false,
        wLikwidacji: false,
        naGpw: true,
      },
      ostatnieSprawozdanie: null,
    };

    await upsertRejestrioLeadCommand({
      organizationId: 'org-1',
      toolName: 'rejestrio__get_krs_info',
      result,
    });

    expect(upsertMock).toHaveBeenCalledOnce();
    const call = upsertMock.mock.calls[0][0];
    expect(call.create.isNaGpw).toBe(true);
    expect(call.create.revenueLast).toBeNull();
    expect(call.create.profitLast).toBeNull();
    expect(call.create.revenueRocznik).toBeNull();
  });

  it('upserts latest populated statement from rejestrio__get_financials', async () => {
    const result = {
      success: true,
      krs: 634215,
      statements: [
        {
          rocznik: 2022,
          source: 'unavailable',
          reason: 'no_json',
        },
        {
          rocznik: 2024,
          source: 'basic_snapshot',
          przychody: 3029247.85,
          zysk: 92707.38,
        },
        {
          rocznik: 2023,
          source: 'fin_document',
          przychody: 2_800_000,
          zysk: 85_000,
        },
      ],
    };

    await upsertRejestrioLeadCommand({
      organizationId: 'org-1',
      toolName: 'rejestrio__get_financials',
      result,
    });

    expect(upsertMock).toHaveBeenCalledOnce();
    const call = upsertMock.mock.calls[0][0];
    // Should pick rocznik 2024 (most recent non-unavailable).
    expect(call.create.revenueLast).toBe(3029247.85);
    expect(call.create.revenueRocznik).toBe(2024);
  });

  it('parses JSON-encoded string results (FastMCP serialises to string)', async () => {
    const raw = JSON.stringify({
      success: true,
      krs: 634215,
      nip: '1132916831',
      nazwaPelna: 'EXAMPLE',
      pkdGlowny: null,
      formaPrawna: null,
      stan: {
        wykreslona: false,
        wUpadlosci: false,
        wLikwidacji: false,
        naGpw: false,
      },
      ostatnieSprawozdanie: null,
    });

    await upsertRejestrioLeadCommand({
      organizationId: 'org-1',
      toolName: 'rejestrio__get_krs_info',
      result: raw,
    });

    expect(upsertMock).toHaveBeenCalledOnce();
  });

  it('silently ignores unrecognised rejestrio tool names', async () => {
    await upsertRejestrioLeadCommand({
      organizationId: 'org-1',
      toolName: 'rejestrio__lookup_company',
      result: { success: true, results: [], totalFound: 0 },
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('silently ignores malformed result payloads without throwing', async () => {
    await expect(
      upsertRejestrioLeadCommand({
        organizationId: 'org-1',
        toolName: 'rejestrio__get_krs_info',
        result: 'not-json-at-all',
      }),
    ).resolves.toBeUndefined();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('swallows upsert failures — enrichment is best-effort', async () => {
    upsertMock.mockRejectedValueOnce(new Error('DB down'));
    await expect(
      upsertRejestrioLeadCommand({
        organizationId: 'org-1',
        toolName: 'rejestrio__get_krs_info',
        result: {
          success: true,
          krs: 123,
          nip: null,
          nazwaPelna: 'X',
          pkdGlowny: null,
          formaPrawna: null,
          stan: {
            wykreslona: false,
            wUpadlosci: false,
            wLikwidacji: false,
            naGpw: false,
          },
          ostatnieSprawozdanie: null,
        },
      }),
    ).resolves.toBeUndefined();
  });
});
