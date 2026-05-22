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
