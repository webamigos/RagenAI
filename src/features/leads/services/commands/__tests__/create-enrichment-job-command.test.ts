import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockTx = {
  $executeRaw: vi.fn(),
  leadEnrichmentJob: { findFirst: vi.fn(), create: vi.fn() },
  lead: { findMany: vi.fn() },
};

const mockLeadListFindFirst = vi.fn();
const mockJobUpdate = vi.fn();
const mockJobUpdateMany = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    leadList: { findFirst: (...a: unknown[]) => mockLeadListFindFirst(...a) },
    leadEnrichmentJob: {
      update: (...a: unknown[]) => mockJobUpdate(...a),
      updateMany: (...a: unknown[]) => mockJobUpdateMany(...a),
    },
    $transaction: async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
  },
}));

const { createEnrichmentJobCommand, recordJobWorkflowIdCommand } = await import(
  '../create-enrichment-job-command'
);
const { NotFoundException } = await import('@/libs/utils/errors');

const LIST_PUBLIC = '11111111-1111-4111-8111-111111111111';
const ORG = 'org_1';

describe('createEnrichmentJobCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NotFoundException when the list is not in the org', async () => {
    mockLeadListFindFirst.mockResolvedValue(null);
    await expect(createEnrichmentJobCommand(LIST_PUBLIC, ORG)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('takes the advisory lock then bails out when an active job exists', async () => {
    mockLeadListFindFirst.mockResolvedValue({ id: 42 });
    mockTx.leadEnrichmentJob.findFirst.mockResolvedValue({ publicId: 'existing-job' });

    const result = await createEnrichmentJobCommand(LIST_PUBLIC, ORG);

    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      jobPublicId: 'existing-job',
      leadPublicIds: [],
      total: 0,
    });
    expect(mockTx.leadEnrichmentJob.create).not.toHaveBeenCalled();
  });

  it('creates a new job with idle+failed lead publicIds when no active job', async () => {
    mockLeadListFindFirst.mockResolvedValue({ id: 7 });
    mockTx.leadEnrichmentJob.findFirst.mockResolvedValue(null);
    mockTx.lead.findMany.mockResolvedValue([
      { publicId: 'lead-1' },
      { publicId: 'lead-2' },
    ]);
    mockTx.leadEnrichmentJob.create.mockResolvedValue({ publicId: 'new-job' });

    const result = await createEnrichmentJobCommand(LIST_PUBLIC, ORG);

    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mockTx.leadEnrichmentJob.create).toHaveBeenCalledWith({
      data: {
        leadListId: 7,
        status: 'pending',
        total: 2,
        processed: 0,
        failed: 0,
      },
      select: { publicId: true },
    });
    expect(result).toEqual({
      jobPublicId: 'new-job',
      leadPublicIds: ['lead-1', 'lead-2'],
      total: 2,
    });
  });
});

describe('recordJobWorkflowIdCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('translates Prisma P2025 into NotFoundException so callers can compensate', async () => {
    const { Prisma } = await import('@/generated/prisma/client');
    const p2025 = new Prisma.PrismaClientKnownRequestError('not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    mockJobUpdate.mockRejectedValue(p2025);

    await expect(
      recordJobWorkflowIdCommand('missing-job', 'wf-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
