import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks (must be declared before any imports of the tested module) ---

const mockGetOrgIdFromAuthOrThrow = vi.fn();
const mockGetCurrentUserId = vi.fn();
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: () => mockGetOrgIdFromAuthOrThrow(),
  getCurrentUserId: () => mockGetCurrentUserId(),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockCreateEnrichmentJob = vi.fn();
const mockRecordWorkflowId = vi.fn();
const mockMarkJobFailed = vi.fn();
vi.mock(
  '@/features/leads/services/commands/create-enrichment-job-command',
  () => ({
    createEnrichmentJobCommand: (...a: unknown[]) =>
      mockCreateEnrichmentJob(...a),
    recordJobWorkflowIdCommand: (...a: unknown[]) => mockRecordWorkflowId(...a),
    markJobFailedCommand: (...a: unknown[]) => mockMarkJobFailed(...a),
  }),
);

const mockGetActiveJob = vi.fn();
vi.mock('@/features/leads/services/queries/get-enrichment-job-query', () => ({
  getActiveEnrichmentJobQuery: (...a: unknown[]) => mockGetActiveJob(...a),
}));

const mockWorkflowStart = vi.fn();
const mockWorkflowTerminate = vi.fn();
vi.mock('@/libs/temporal', () => ({
  getTemporalClient: () => ({
    workflow: {
      start: (...a: unknown[]) => mockWorkflowStart(...a),
    },
  }),
  TASK_QUEUE_NAME: 'ragen-tasks',
}));

// Stub the rest of the action dependencies — these aren't exercised in these tests.
vi.mock('@/features/leads/services/commands/score-lead-command', () => ({
  scoreLeadCommand: vi.fn(),
}));
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: { findFirst: vi.fn() },
    leadList: { findFirst: vi.fn(), update: vi.fn() },
    lead: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  },
}));

const mockParseScoringCriteria = vi.hoisted(() => vi.fn());
vi.mock(
  '@/features/leads/services/commands/parse-scoring-criteria-command',
  () => ({
    parseScoringCriteriaCommand: (...a: unknown[]) =>
      mockParseScoringCriteria(...a),
  }),
);

const mockExtractText = vi.hoisted(() => vi.fn());
vi.mock('@/features/leads/utils/extract-scoring-file-text', () => ({
  extractScoringFileText: (...a: unknown[]) => mockExtractText(...a),
}));
vi.mock('@/generated/prisma/client', () => ({
  LeadEnrichmentStatus: {
    enriched: 'enriched',
    pending: 'pending',
    failed: 'failed',
  },
  LeadScoringStatus: {
    idle: 'idle',
    scored: 'scored',
    pending: 'pending',
    failed: 'failed',
  },
  CreditOperation: {
    ENRICH_REJESTRIO: 'ENRICH_REJESTRIO',
    SCORE_LEAD_CRITERION: 'SCORE_LEAD_CRITERION',
    SCORE_LEAD_DISQUALIFIER: 'SCORE_LEAD_DISQUALIFIER',
    SCORE_LEAD_SINGLE_PROMPT: 'SCORE_LEAD_SINGLE_PROMPT',
  },
}));
vi.mock('@/features/credits/services/commands/spend-credits-command', () => ({
  spendCreditsCommand: vi.fn().mockResolvedValue({
    ok: true,
    balance: 999,
    ledgerPublicId: 'l-1',
    deduplicated: false,
  }),
}));
vi.mock('@/features/credits/services/queries/get-balance-query', () => ({
  getBalanceQuery: vi.fn().mockResolvedValue({
    organizationId: 'org_1',
    balance: 10000,
    lifetimeGranted: 10000,
    lifetimeSpent: 0,
    updatedAt: new Date(),
  }),
}));
vi.mock('@/features/leads/utils/parse-csv', () => ({
  parseLeadsCsv: vi.fn(),
  MAX_CSV_ROWS: 50_000,
}));
vi.mock('@/features/leads/services/commands/create-lead-list-command', () => ({
  createLeadListCommand: vi.fn(),
}));
vi.mock('@/features/leads/services/commands/delete-lead-list-command', () => ({
  deleteLeadListCommand: vi.fn(),
}));
vi.mock('@/features/leads/services/commands/rename-lead-list-command', () => ({
  renameLeadListCommand: vi.fn(),
}));
vi.mock(
  '@/features/leads/services/commands/update-lead-enrichment-command',
  () => ({
    markLeadEnrichmentPendingCommand: vi.fn(),
    completeLeadEnrichmentCommand: vi.fn(),
  }),
);
vi.mock('@/features/leads/services/queries/get-lead-lists-query', () => ({
  getLeadListsQuery: vi.fn(),
}));
vi.mock('@/features/leads/services/queries/get-lead-list-query', () => ({
  getLeadListWithLeadsQuery: vi.fn(),
}));
vi.mock('@/features/leads/services/queries/get-lead-query', () => ({
  getLeadByPublicIdQuery: vi.fn(),
}));
vi.mock('@/libs/rejestrio-http', () => ({
  getRejestrioHttpClient: vi.fn(),
  buildCustomerId: vi.fn(),
  payloadToColumnFields: vi.fn(),
}));

const { bulkEnrichLeadList, getActiveEnrichmentJob } = await import('../leads');

const LIST_PUBLIC_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = 'org_1';
const USER_ID = 'user_1';

describe('bulkEnrichLeadList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgIdFromAuthOrThrow.mockResolvedValue(ORG_ID);
    mockGetCurrentUserId.mockResolvedValue(USER_ID);
  });

  it('returns total=0 + alreadyRunning when nothing to enqueue', async () => {
    mockCreateEnrichmentJob.mockResolvedValue({
      jobPublicId: 'job-1',
      leadPublicIds: [],
      total: 0,
    });

    const result = await bulkEnrichLeadList({
      leadListPublicId: LIST_PUBLIC_ID,
    });

    expect(result).toEqual({
      jobPublicId: 'job-1',
      total: 0,
      alreadyRunning: true,
    });
    expect(mockWorkflowStart).not.toHaveBeenCalled();
    expect(mockMarkJobFailed).not.toHaveBeenCalled();
  });

  it('starts the workflow and records the workflow id on the happy path', async () => {
    mockCreateEnrichmentJob.mockResolvedValue({
      jobPublicId: 'job-2',
      leadPublicIds: ['lead-a', 'lead-b'],
      total: 2,
    });
    mockWorkflowStart.mockResolvedValue({ terminate: mockWorkflowTerminate });

    const result = await bulkEnrichLeadList({
      leadListPublicId: LIST_PUBLIC_ID,
    });

    expect(mockWorkflowStart).toHaveBeenCalledTimes(1);
    const [name, opts] = mockWorkflowStart.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe('bulkEnrichLeadList');
    expect(opts.taskQueue).toBe('ragen-tasks');
    expect(opts.workflowExecutionTimeout).toBe('1h');
    expect(opts.workflowId).toMatch(/^lead-enrich-job-2-/);
    expect(mockRecordWorkflowId).toHaveBeenCalledWith(
      'job-2',
      expect.stringMatching(/^lead-enrich-/),
    );
    expect(mockMarkJobFailed).not.toHaveBeenCalled();
    expect(result).toEqual({
      jobPublicId: 'job-2',
      total: 2,
      alreadyRunning: false,
    });
  });

  it('marks the job failed when workflow.start throws', async () => {
    mockCreateEnrichmentJob.mockResolvedValue({
      jobPublicId: 'job-3',
      leadPublicIds: ['lead-a'],
      total: 1,
    });
    mockWorkflowStart.mockRejectedValue(new Error('temporal down'));

    await expect(
      bulkEnrichLeadList({ leadListPublicId: LIST_PUBLIC_ID }),
    ).rejects.toThrow('Failed to start enrichment job');

    expect(mockMarkJobFailed).toHaveBeenCalledWith('job-3', 'temporal down');
    expect(mockRecordWorkflowId).not.toHaveBeenCalled();
  });

  it('terminates the orphaned workflow when recording the workflow id fails', async () => {
    mockCreateEnrichmentJob.mockResolvedValue({
      jobPublicId: 'job-4',
      leadPublicIds: ['lead-a'],
      total: 1,
    });
    mockWorkflowStart.mockResolvedValue({ terminate: mockWorkflowTerminate });
    mockWorkflowTerminate.mockResolvedValue(undefined);
    mockRecordWorkflowId.mockRejectedValue(new Error('db blip'));

    await expect(
      bulkEnrichLeadList({ leadListPublicId: LIST_PUBLIC_ID }),
    ).rejects.toThrow('Failed to start enrichment job');

    expect(mockWorkflowTerminate).toHaveBeenCalledTimes(1);
    expect(mockMarkJobFailed).toHaveBeenCalledWith('job-4', 'db blip');
  });

  it('rejects invalid UUIDs at the action boundary', async () => {
    await expect(
      bulkEnrichLeadList({ leadListPublicId: 'not-a-uuid' }),
    ).rejects.toThrow();
    expect(mockCreateEnrichmentJob).not.toHaveBeenCalled();
  });

  it('throws InsufficientCreditsException and marks the job failed when balance < estimated cost', async () => {
    mockCreateEnrichmentJob.mockResolvedValue({
      jobPublicId: 'job-broke',
      leadPublicIds: ['lead-a', 'lead-b', 'lead-c'],
      total: 3,
    });
    const { getBalanceQuery } =
      await import('@/features/credits/services/queries/get-balance-query');
    vi.mocked(getBalanceQuery).mockResolvedValueOnce({
      organizationId: ORG_ID,
      balance: 2,
      lifetimeGranted: 2,
      lifetimeSpent: 0,
      updatedAt: new Date(),
    });

    await expect(
      bulkEnrichLeadList({ leadListPublicId: LIST_PUBLIC_ID }),
    ).rejects.toThrow(/Insufficient credits/);

    expect(mockMarkJobFailed).toHaveBeenCalledWith(
      'job-broke',
      'insufficient_credits',
    );
    expect(mockWorkflowStart).not.toHaveBeenCalled();
  });
});

describe('getActiveEnrichmentJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgIdFromAuthOrThrow.mockResolvedValue(ORG_ID);
    mockGetCurrentUserId.mockResolvedValue(USER_ID);
  });

  it('passes orgId derived from session, never trusting client input', async () => {
    mockGetActiveJob.mockResolvedValue(null);
    await getActiveEnrichmentJob({ leadListPublicId: LIST_PUBLIC_ID });
    expect(mockGetActiveJob).toHaveBeenCalledWith(LIST_PUBLIC_ID, ORG_ID);
  });
});

describe('uploadScoringFile', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetOrgIdFromAuthOrThrow.mockResolvedValue('org-1');
    const db = (await import('@ragenai/prisma-client')).default;
    (db.userFile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      fileExtension: 'pdf',
      fileSize: 1024,
      fileName: 'scoring.pdf',
      fileType: 'PDF',
      organizationId: 'org-1',
    });
    (db.leadList.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 42,
    });
    (db.leadList.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (db.lead.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 3,
    });
    mockExtractText.mockResolvedValue('criteria text');
    mockParseScoringCriteria.mockResolvedValue(undefined);
  });

  it('calls parseScoringCriteriaCommand after saving scoringFileId', async () => {
    const { uploadScoringFile } = await import('@/app/actions/leads');
    await uploadScoringFile({
      leadListPublicId: '22222222-2222-4222-8222-222222222222',
      fileId: '33333333-3333-4333-8333-333333333333',
    });
    expect(mockParseScoringCriteria).toHaveBeenCalledWith(
      'criteria text',
      'org-1',
      '22222222-2222-4222-8222-222222222222',
    );
  });

  it('resets scored leads to idle after file upload', async () => {
    const { uploadScoringFile } = await import('@/app/actions/leads');
    await uploadScoringFile({
      leadListPublicId: '22222222-2222-4222-8222-222222222222',
      fileId: '33333333-3333-4333-8333-333333333333',
    });
    const db = (await import('@ragenai/prisma-client')).default;
    expect(db.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadListId: 42,
          scoringStatus: 'scored',
        }),
        data: expect.objectContaining({ scoringStatus: 'idle' }),
      }),
    );
  });
});
