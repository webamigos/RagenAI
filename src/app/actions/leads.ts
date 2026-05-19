'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '../lib/utils/auth-helpers';
import {
  UnauthorizedException,
  NotFoundException,
  LimitExceededException,
  BadRequestException,
} from '@/libs/utils/errors';
import { logger } from '../lib/utils/logger';
import { parseLeadsCsv, MAX_CSV_ROWS } from '@/features/leads/utils/parse-csv';
import { createLeadListCommand } from '@/features/leads/services/commands/create-lead-list-command';
import { deleteLeadListCommand } from '@/features/leads/services/commands/delete-lead-list-command';
import { renameLeadListCommand } from '@/features/leads/services/commands/rename-lead-list-command';
import {
  markLeadEnrichmentPendingCommand,
  completeLeadEnrichmentCommand,
} from '@/features/leads/services/commands/update-lead-enrichment-command';
import { getLeadListsQuery } from '@/features/leads/services/queries/get-lead-lists-query';
import { getLeadListWithLeadsQuery } from '@/features/leads/services/queries/get-lead-list-query';
import { getLeadByPublicIdQuery } from '@/features/leads/services/queries/get-lead-query';
import {
  getRejestrioHttpClient,
  buildCustomerId,
  payloadToColumnFields,
} from '@/libs/rejestrio-http';
import {
  detectLookup,
  NIP_RE,
  KRS_RE,
} from '@/features/leads/utils/detect-lookup';
import {
  createEnrichmentJobCommand,
  markJobFailedCommand,
  recordJobWorkflowIdCommand,
} from '@/features/leads/services/commands/create-enrichment-job-command';
import {
  getActiveEnrichmentJobQuery,
  type LeadEnrichmentJobDto,
} from '@/features/leads/services/queries/get-enrichment-job-query';
import {
  LeadsWorkflow,
  type BulkEnrichLeadListPayload,
} from '@/features/leads/contracts/workflow.types';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { nanoid } from 'nanoid';
import { scoreLeadCommand } from '@/features/leads/services/commands/score-lead-command';
import db from '@ragenai/prisma-client';
import {
  LeadEnrichmentStatus,
  LeadScoringStatus,
} from '@/generated/prisma/client';

const NAME_MAX = 120;
const LEADS_PATH = '/leads';

function sanitizeEnrichError(code: string, error: string): string {
  if (code === 'not_found') {
    return error;
  }
  if (code === 'ambiguous') {
    return error;
  }
  if (error.includes('budget exceeded')) {
    return 'Daily enrichment budget exceeded. Try again tomorrow.';
  }
  if (code === 'upstream') {
    return 'Enrichment service unavailable. Try again later.';
  }
  return error;
}

async function requireOrgAndUser() {
  const organizationId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new UnauthorizedException('Not authenticated');
  }
  return { organizationId, userId };
}

export async function getLeadLists() {
  const { organizationId } = await requireOrgAndUser();
  return getLeadListsQuery(organizationId);
}

export async function getLeadList(
  publicId: string,
  options?: { page?: number; pageSize?: number },
) {
  const { organizationId } = await requireOrgAndUser();
  return getLeadListWithLeadsQuery(publicId, organizationId, options);
}

// Cap upload byte size proportional to MAX_CSV_ROWS so a malicious payload
// can't OOM the parser before the row-count guard fires (~100 bytes/row × 50k
// = ~5 MB; round up for headroom).
const MAX_CSV_BYTES = 10 * 1024 * 1024;

const createInputSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  csv: z.string().min(1).max(MAX_CSV_BYTES),
});

export async function createLeadListFromCsv(input: {
  name: string;
  csv: string;
}): Promise<{ publicId: string }> {
  const { organizationId, userId } = await requireOrgAndUser();
  const parsed = createInputSchema.parse(input);

  if (Buffer.byteLength(parsed.csv, 'utf8') > MAX_CSV_BYTES) {
    throw new LimitExceededException('CSV file exceeds the 10 MB size limit');
  }

  let csvResult;
  try {
    csvResult = parseLeadsCsv(parsed.csv);
  } catch (error) {
    logger.warn({ err: error }, 'createLeadListFromCsv: parse failure');
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Failed to parse CSV',
    );
  }

  if (csvResult.columns.length === 0 || csvResult.rows.length === 0) {
    throw new BadRequestException('CSV has no usable rows');
  }
  if (csvResult.rows.length > MAX_CSV_ROWS) {
    throw new LimitExceededException(`CSV exceeds ${MAX_CSV_ROWS} rows`);
  }

  const created = await createLeadListCommand({
    organizationId,
    createdById: userId,
    name: parsed.name,
    columns: csvResult.columns,
    rows: csvResult.rows,
  });

  revalidatePath(LEADS_PATH);
  return { publicId: created.publicId };
}

const renameSchema = z.object({
  publicId: z.string().uuid(),
  name: z.string().trim().min(1).max(NAME_MAX),
});

export async function renameLeadList(input: {
  publicId: string;
  name: string;
}) {
  const { organizationId } = await requireOrgAndUser();
  const { publicId, name } = renameSchema.parse(input);
  await renameLeadListCommand(publicId, organizationId, name);
  revalidatePath(LEADS_PATH);
  revalidatePath(`${LEADS_PATH}/${publicId}`);
}

const deleteSchema = z.object({ publicId: z.string().uuid() });

export async function deleteLeadList(input: { publicId: string }) {
  const { organizationId } = await requireOrgAndUser();
  const { publicId } = deleteSchema.parse(input);
  await deleteLeadListCommand(publicId, organizationId);
  revalidatePath(LEADS_PATH);
}

const enrichSchema = z.object({
  leadPublicId: z.string().uuid(),
  lookup: z
    .object({
      nip: z.string().regex(NIP_RE).optional(),
      krs: z.string().regex(KRS_RE).optional(),
      name: z.string().min(2).max(200).optional(),
    })
    .optional(),
});

export async function enrichLead(input: {
  leadPublicId: string;
  lookup?: { nip?: string; krs?: string; name?: string };
}): Promise<{ status: 'enriched' | 'failed' | 'in_progress'; error?: string }> {
  const { organizationId, userId } = await requireOrgAndUser();
  const { leadPublicId, lookup } = enrichSchema.parse(input);

  const lead = await getLeadByPublicIdQuery(leadPublicId, organizationId);
  if (!lead) {
    throw new NotFoundException('Lead not found');
  }

  const resolved = lookup ?? detectLookup(lead.data);
  if (!resolved || (!resolved.nip && !resolved.krs && !resolved.name)) {
    throw new BadRequestException(
      'Could not infer a NIP/KRS/name to look up for this lead',
    );
  }

  const claimed = await markLeadEnrichmentPendingCommand(
    leadPublicId,
    organizationId,
  );
  if (!claimed) {
    return { status: 'in_progress' };
  }

  try {
    const client = getRejestrioHttpClient();
    const response = await client.enrichCompany({
      customerId: buildCustomerId(organizationId, userId),
      nip: resolved.nip,
      krs: resolved.krs,
      name: resolved.name,
      includeFinancials: true,
    });

    if (response.success) {
      await completeLeadEnrichmentCommand(leadPublicId, organizationId, {
        ok: true,
        fields: payloadToColumnFields(response.data),
      });
      // /leads/{listPublicId} detail page re-renders via revalidatePath on
      // /leads parent — Next will refetch matching dynamic children too.
      revalidatePath(LEADS_PATH, 'layout');
      return { status: 'enriched' };
    }

    await completeLeadEnrichmentCommand(leadPublicId, organizationId, {
      ok: false,
      error: response.error,
    });
    revalidatePath(LEADS_PATH, 'layout');
    return {
      status: 'failed',
      error: sanitizeEnrichError(response.code, response.error),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'enrichment crashed';
    logger.error({ err: error, leadPublicId }, 'enrichLead unexpected failure');
    await completeLeadEnrichmentCommand(leadPublicId, organizationId, {
      ok: false,
      error: message,
    });
    revalidatePath(LEADS_PATH);
    return { status: 'failed', error: message };
  }
}

const bulkEnrichSchema = z.object({ leadListPublicId: z.string().uuid() });

export async function bulkEnrichLeadList(input: {
  leadListPublicId: string;
}): Promise<{
  jobPublicId: string;
  total: number;
  alreadyRunning: boolean;
}> {
  const { organizationId, userId } = await requireOrgAndUser();
  const { leadListPublicId } = bulkEnrichSchema.parse(input);

  const job = await createEnrichmentJobCommand(
    leadListPublicId,
    organizationId,
  );

  // Either no leads need work, or an active job already exists.
  if (job.total === 0) {
    return { jobPublicId: job.jobPublicId, total: 0, alreadyRunning: true };
  }

  const workflowId = `lead-enrich-${job.jobPublicId}-${nanoid(6)}`;
  const payload: BulkEnrichLeadListPayload = {
    jobPublicId: job.jobPublicId,
    leadListPublicId,
    organizationId,
    userId,
    leadPublicIds: job.leadPublicIds,
  };

  const client = getTemporalClient();
  let handle: Awaited<ReturnType<typeof client.workflow.start>> | null = null;
  try {
    handle = await client.workflow.start(LeadsWorkflow.BULK_ENRICH_LEAD_LIST, {
      taskQueue: TASK_QUEUE_NAME,
      workflowId,
      args: [payload],
      // Cap so an offline worker doesn't strand a "pending" job forever.
      workflowExecutionTimeout: '1h',
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    await markJobFailedCommand(job.jobPublicId, reason);
    logger.error(
      { err: error, jobPublicId: job.jobPublicId },
      'bulkEnrichLeadList: workflow start failed',
    );
    throw new Error('Failed to start enrichment job');
  }

  try {
    await recordJobWorkflowIdCommand(job.jobPublicId, workflowId);
  } catch (error) {
    // Workflow is live but we can't tie it to the job — terminate to avoid an orphan.
    await handle
      .terminate('failed to record workflow id')
      .catch((termError) => {
        logger.error(
          { err: termError, workflowId },
          'bulkEnrichLeadList: failed to terminate orphaned workflow',
        );
      });
    await markJobFailedCommand(
      job.jobPublicId,
      error instanceof Error ? error.message : 'record-workflow-id failed',
    );
    throw new Error('Failed to start enrichment job');
  }

  logger.info(
    { workflowId, jobPublicId: job.jobPublicId },
    'Started bulk enrich workflow',
  );
  return {
    jobPublicId: job.jobPublicId,
    total: job.total,
    alreadyRunning: false,
  };
}

export async function getActiveEnrichmentJob(input: {
  leadListPublicId: string;
}): Promise<LeadEnrichmentJobDto | null> {
  const { organizationId } = await requireOrgAndUser();
  const { leadListPublicId } = bulkEnrichSchema.parse(input);
  return getActiveEnrichmentJobQuery(leadListPublicId, organizationId);
}

const SCORING_FILE_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_SCORING_EXT = ['pdf', 'docx'];

const scoringFileSchema = z.object({
  leadListPublicId: z.string().uuid(),
  fileId: z.string().uuid(),
});

export async function uploadScoringFile(input: {
  leadListPublicId: string;
  fileId: string;
}): Promise<void> {
  const { organizationId } = await requireOrgAndUser();
  const { leadListPublicId, fileId } = scoringFileSchema.parse(input);

  const file = await db.userFile.findFirst({
    where: { id: fileId, organizationId },
    select: { id: true, fileExtension: true, fileSize: true },
  });
  if (!file) {
    throw new NotFoundException('File not found');
  }
  if (file.fileSize > SCORING_FILE_MAX_BYTES) {
    throw new LimitExceededException('Scoring file exceeds 20 MB limit');
  }
  const ext = file.fileExtension?.toLowerCase() ?? '';
  if (!ALLOWED_SCORING_EXT.includes(ext)) {
    throw new BadRequestException('Scoring file must be PDF or DOCX');
  }

  const list = await db.leadList.findFirst({
    where: { publicId: leadListPublicId, organizationId },
    select: { id: true },
  });
  if (!list) {
    throw new NotFoundException('Lead list not found');
  }

  await db.leadList.update({
    where: { id: list.id },
    data: { scoringFileId: file.id, updatedAt: new Date() },
  });
  revalidatePath(`${LEADS_PATH}/${leadListPublicId}`);
}

const removeScoringSchema = z.object({ leadListPublicId: z.string().uuid() });

export async function removeScoringFile(input: {
  leadListPublicId: string;
}): Promise<void> {
  const { organizationId } = await requireOrgAndUser();
  const { leadListPublicId } = removeScoringSchema.parse(input);

  const list = await db.leadList.findFirst({
    where: { publicId: leadListPublicId, organizationId },
    select: { id: true },
  });
  if (!list) {
    throw new NotFoundException('Lead list not found');
  }

  await db.leadList.update({
    where: { id: list.id },
    data: { scoringFileId: null, updatedAt: new Date() },
  });
  revalidatePath(`${LEADS_PATH}/${leadListPublicId}`);
}

const scoreLeadSchema = z.object({
  leadPublicId: z.string().uuid(),
  leadListPublicId: z.string().uuid(),
});

export async function scoreLead(input: {
  leadPublicId: string;
  leadListPublicId: string;
}): Promise<{
  status: 'scored' | 'failed' | 'in_progress';
  score?: number;
  justification?: string;
  error?: string;
}> {
  const { organizationId } = await requireOrgAndUser();
  const { leadPublicId, leadListPublicId } = scoreLeadSchema.parse(input);

  const lead = await db.lead.findFirst({
    where: { publicId: leadPublicId, leadList: { organizationId } },
    select: { enrichmentStatus: true, data: true },
  });
  if (!lead) {
    throw new NotFoundException('Lead not found');
  }
  if (lead.enrichmentStatus !== LeadEnrichmentStatus.enriched) {
    throw new BadRequestException('Lead must be enriched before scoring');
  }

  const result = await scoreLeadCommand(
    leadPublicId,
    leadListPublicId,
    (lead.data ?? {}) as Record<string, unknown>,
    organizationId,
  );

  revalidatePath(LEADS_PATH, 'layout');
  return result;
}

const bulkScoreSchema = z.object({ leadListPublicId: z.string().uuid() });

const MAX_BULK_SCORE_ROWS = 100;

export async function bulkScoreLeadList(input: {
  leadListPublicId: string;
}): Promise<{ processed: number; failed: number; inProgress: number }> {
  const { organizationId } = await requireOrgAndUser();
  const { leadListPublicId } = bulkScoreSchema.parse(input);

  const list = await db.leadList.findFirst({
    where: { publicId: leadListPublicId, organizationId },
    select: { id: true, scoringFileId: true },
  });
  if (!list) {
    throw new NotFoundException('Lead list not found');
  }
  if (!list.scoringFileId) {
    throw new BadRequestException('No scoring file attached to this list');
  }

  const leads = await db.lead.findMany({
    where: {
      leadListId: list.id,
      enrichmentStatus: LeadEnrichmentStatus.enriched,
      scoringStatus: { not: LeadScoringStatus.scored },
    },
    select: { publicId: true, data: true },
    take: MAX_BULK_SCORE_ROWS,
    orderBy: { rowIndex: 'asc' },
  });

  let processed = 0;
  let failed = 0;
  let inProgress = 0;
  for (const lead of leads) {
    const result = await scoreLeadCommand(
      lead.publicId,
      leadListPublicId,
      (lead.data ?? {}) as Record<string, unknown>,
      organizationId,
    );
    if (result.status === 'scored') {
      processed++;
    } else if (result.status === 'failed') {
      failed++;
    } else {
      inProgress++;
    }
  }

  revalidatePath(LEADS_PATH, 'layout');
  return { processed, failed, inProgress };
}
