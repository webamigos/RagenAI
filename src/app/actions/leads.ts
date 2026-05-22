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
  InsufficientCreditsException,
} from '@/libs/utils/errors';
import { spendCreditsCommand } from '@/features/credits/services/commands/spend-credits-command';
import { getBalanceQuery } from '@/features/credits/services/queries/get-balance-query';
import { CREDIT_COSTS } from '@/features/credits/constants/credit-costs';
import { logger } from '../lib/utils/logger';
import { parseLeadsCsv, MAX_CSV_ROWS } from '@/features/leads/utils/parse-csv';
import { createLeadListCommand } from '@/features/leads/services/commands/create-lead-list-command';
import { deleteLeadListCommand } from '@/features/leads/services/commands/delete-lead-list-command';
import { deleteLeadsCommand } from '@/features/leads/services/commands/delete-leads-command';
import { createListFromLeadsCommand } from '@/features/leads/services/commands/create-list-from-leads-command';
import { addLeadsToListCommand } from '@/features/leads/services/commands/add-leads-to-list-command';
import { renameLeadListCommand } from '@/features/leads/services/commands/rename-lead-list-command';
import {
  markLeadEnrichmentPendingCommand,
  completeLeadEnrichmentCommand,
} from '@/features/leads/services/commands/update-lead-enrichment-command';
import { getLeadListsQuery } from '@/features/leads/services/queries/get-lead-lists-query';
import { NOT_FOUND_ERROR_MARKER } from '@/features/leads/contracts/lead-list.types';
import {
  ENRICHMENT_COLUMNS,
  LeadColumnsSchema,
} from '@/features/leads/contracts/lead-column.types';
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
import { parseScoringCriteriaCommand } from '@/features/leads/services/commands/parse-scoring-criteria-command';
import { extractScoringFileText } from '@/features/leads/utils/extract-scoring-file-text';
import db from '@ragenai/prisma-client';
import {
  CreditOperation,
  LeadEnrichmentStatus,
  LeadScoringStatus,
} from '@/generated/prisma/client';

const NAME_MAX = 120;
const LEADS_PATH = '/leads';

function sanitizeEnrichError(code: string, error: string): string {
  if (code === 'not_found') {
    // Sentinel so the UI can render a distinct "Not found" state without
    // a Prisma migration. Carries no human-readable detail because the
    // UI translates the label per locale.
    return NOT_FOUND_ERROR_MARKER;
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

const MAX_BULK_DELETE = 5000;

const deleteLeadsSchema = z.object({
  leadListPublicId: z.string().uuid(),
  leadPublicIds: z.array(z.string().uuid()).min(1).max(MAX_BULK_DELETE),
});

export async function deleteLeads(input: {
  leadListPublicId: string;
  leadPublicIds: string[];
}): Promise<{ deleted: number }> {
  const { organizationId } = await requireOrgAndUser();
  const parsed = deleteLeadsSchema.parse(input);
  const result = await deleteLeadsCommand({
    ...parsed,
    organizationId,
  });
  revalidatePath(LEADS_PATH);
  revalidatePath(`${LEADS_PATH}/${parsed.leadListPublicId}`);
  return result;
}

const createListFromLeadsSchema = z.object({
  sourceListPublicId: z.string().uuid(),
  name: z.string().trim().min(1).max(NAME_MAX),
  leadPublicIds: z.array(z.string().uuid()).min(1).max(MAX_BULK_DELETE),
});

export async function createListFromLeads(input: {
  sourceListPublicId: string;
  name: string;
  leadPublicIds: string[];
}): Promise<{ publicId: string; rowCount: number }> {
  const { organizationId, userId } = await requireOrgAndUser();
  const parsed = createListFromLeadsSchema.parse(input);
  const result = await createListFromLeadsCommand({
    ...parsed,
    organizationId,
    createdById: userId,
  });
  revalidatePath(LEADS_PATH);
  return result;
}

const addLeadsToListSchema = z.object({
  sourceListPublicId: z.string().uuid(),
  targetListPublicId: z.string().uuid(),
  leadPublicIds: z.array(z.string().uuid()).min(1).max(MAX_BULK_DELETE),
});

export async function addLeadsToList(input: {
  sourceListPublicId: string;
  targetListPublicId: string;
  leadPublicIds: string[];
}): Promise<{ added: number; targetListPublicId: string }> {
  const { organizationId } = await requireOrgAndUser();
  const parsed = addLeadsToListSchema.parse(input);
  const result = await addLeadsToListCommand({
    ...parsed,
    organizationId,
  });
  revalidatePath(LEADS_PATH);
  revalidatePath(`${LEADS_PATH}/${parsed.targetListPublicId}`);
  return result;
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

  // Pre-flight credit check before doing any work. Throw early so the caller
  // sees a clean error rather than seeing the lead transition to pending and
  // back to failed.
  const enrichCost = CREDIT_COSTS[CreditOperation.ENRICH_REJESTRIO];
  const balance = await getBalanceQuery(organizationId);
  if (balance.balance < enrichCost) {
    throw new InsufficientCreditsException(enrichCost, balance.balance);
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
      // Charge on success only. Idempotency key ties the spend to the lead
      // so a retried single enrichment doesn't double-charge.
      await spendCreditsCommand({
        organizationId,
        amount: enrichCost,
        operation: CreditOperation.ENRICH_REJESTRIO,
        referenceId: leadPublicId,
        userId,
        idempotencyKey: `enrich:single:${leadPublicId}`,
      });
      // Targeted revalidation of just the detail page. Avoid
      // revalidatePath(..., 'layout') — it invalidates the whole /leads
      // subtree and serializes the per-client server-action queue, which
      // makes subsequent enrich clicks hang.
      revalidatePath(`${LEADS_PATH}/${lead.leadListPublicId}`);
      return { status: 'enriched' };
    }

    const storedError =
      response.code === 'not_found' ? NOT_FOUND_ERROR_MARKER : response.error;
    await completeLeadEnrichmentCommand(leadPublicId, organizationId, {
      ok: false,
      error: storedError,
    });
    revalidatePath(`${LEADS_PATH}/${lead.leadListPublicId}`);
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
    revalidatePath(`${LEADS_PATH}/${lead.leadListPublicId}`);
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

  // Pre-flight credit check: worst case is 1 credit per lead. The worker
  // only charges on successful enrichment (no charge on not_found/upstream
  // errors), so this is an upper bound — callers won't over-pay.
  const estimatedCost =
    job.total * CREDIT_COSTS[CreditOperation.ENRICH_REJESTRIO];
  const balance = await getBalanceQuery(organizationId);
  if (balance.balance < estimatedCost) {
    await markJobFailedCommand(job.jobPublicId, 'insufficient_credits');
    throw new InsufficientCreditsException(estimatedCost, balance.balance);
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

  // Select once with every field we need later (extract-text path also
  // needs fileName / fileType / organizationId) to avoid a second
  // findFirst after the size/extension validation.
  const file = await db.userFile.findFirst({
    where: { id: fileId, organizationId },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileExtension: true,
      fileSize: true,
      organizationId: true,
    },
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
    select: { id: true, columns: true },
  });
  if (!list) {
    throw new NotFoundException('Lead list not found');
  }

  // Lists created before scoring shipped don't have the score/justification
  // columns in their `columns` JSON, so the grid never renders the cells
  // even though `lead.data._enrichment_score` is populated by scoreLead.
  // Backfill them here so first upload makes scoring visible.
  const parsed = LeadColumnsSchema.safeParse(list.columns);
  const existingColumns = parsed.success ? parsed.data : [];
  const existingKeys = new Set(existingColumns.map((c) => c.key));
  const SCORE_COLUMN_KEYS = [
    '_enrichment_score',
    '_enrichment_score_justification',
  ];
  const missingScoreColumns = ENRICHMENT_COLUMNS.filter(
    (c) => SCORE_COLUMN_KEYS.includes(c.key) && !existingKeys.has(c.key),
  );

  await db.leadList.update({
    where: { id: list.id },
    data: {
      scoringFileId: file.id,
      updatedAt: new Date(),
      ...(missingScoreColumns.length > 0
        ? {
            columns: [
              ...existingColumns,
              ...missingScoreColumns,
            ] as unknown as object,
          }
        : {}),
    },
  });

  // Extract text + parse criteria (errors stored in scoringCriteriaError,
  // never throw). Reuses the file record selected above instead of
  // re-querying — the extra fields needed (fileName / fileType /
  // organizationId) were already included in the initial select.
  const criteriaText = await extractScoringFileText(file).catch(() => null);
  if (criteriaText) {
    await parseScoringCriteriaCommand(
      criteriaText,
      organizationId,
      leadListPublicId,
    );
  }

  // Reset previously scored leads so they re-score with new criteria
  await db.lead.updateMany({
    where: { leadListId: list.id, scoringStatus: LeadScoringStatus.scored },
    data: { scoringStatus: LeadScoringStatus.idle, scoringError: null },
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

  // Targeted revalidation — avoids layout-wide invalidation which
  // serializes the per-client Server-Action queue and wedges subsequent
  // clicks (same fix applied to enrichLead).
  revalidatePath(`${LEADS_PATH}/${leadListPublicId}`);
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

  revalidatePath(`${LEADS_PATH}/${leadListPublicId}`);
  return { processed, failed, inProgress };
}
