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
import {
  getLeadListWithLeadsQuery,
} from '@/features/leads/services/queries/get-lead-list-query';
import { getLeadByPublicIdQuery } from '@/features/leads/services/queries/get-lead-query';
import {
  getRejestrioHttpClient,
  buildCustomerId,
  payloadToColumnFields,
} from '@/libs/rejestrio-http';
import { detectLookup, NIP_RE, KRS_RE } from '@/features/leads/utils/detect-lookup';

const NAME_MAX = 120;
const LEADS_PATH = '/leads';

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

export async function getLeadList(publicId: string, options?: { take?: number; skip?: number }) {
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

  let csvResult;
  try {
    csvResult = parseLeadsCsv(parsed.csv);
  } catch (error) {
    logger.warn({ err: error }, 'createLeadListFromCsv: parse failure');
    throw new Error(
      error instanceof Error ? error.message : 'Failed to parse CSV',
    );
  }

  if (csvResult.columns.length === 0 || csvResult.rows.length === 0) {
    throw new Error('CSV has no usable rows');
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

export async function renameLeadList(input: { publicId: string; name: string }) {
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
    throw new Error('Could not infer a NIP/KRS/name to look up for this lead');
  }

  const claimed = await markLeadEnrichmentPendingCommand(leadPublicId, organizationId);
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
    return { status: 'failed', error: response.error };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'enrichment crashed';
    logger.error({ err: error, leadPublicId }, 'enrichLead unexpected failure');
    await completeLeadEnrichmentCommand(leadPublicId, organizationId, {
      ok: false,
      error: message,
    });
    revalidatePath(LEADS_PATH);
    return { status: 'failed', error: message };
  }
}
