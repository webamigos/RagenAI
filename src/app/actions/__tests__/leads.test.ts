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
    createEnrichmentJobCommand: (...a: unknown[]) => mockCreateEnrichmentJob(...a),
    recordJobWorkflowIdCommand: (...a: unknown[]) => mockRecordWorkflowId(...a),
    markJobFailedCommand: (...a: unknown[]) => mockMarkJobFailed(...a),
  }),
);

const mockGetActiveJob = vi.fn();
vi.mock(
  '@/features/leads/services/queries/get-enrichment-job-query',
  () => ({
    getActiveEnrichmentJobQuery: (...a: unknown[]) => mockGetActiveJob(...a),
  }),
);

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

    const result = await bulkEnrichLeadList({ leadListPublicId: LIST_PUBLIC_ID });

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

    const result = await bulkEnrichLeadList({ leadListPublicId: LIST_PUBLIC_ID });

    expect(mockWorkflowStart).toHaveBeenCalledTimes(1);
    const [name, opts] = mockWorkflowStart.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('bulkEnrichLeadList');
    expect(opts.taskQueue).toBe('ragen-tasks');
    expect(opts.workflowExecutionTimeout).toBe('1h');
    expect(opts.workflowId).toMatch(/^lead-enrich-job-2-/);
    expect(mockRecordWorkflowId).toHaveBeenCalledWith('job-2', expect.stringMatching(/^lead-enrich-/));
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
