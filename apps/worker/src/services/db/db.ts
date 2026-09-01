import knex from 'knex';
import { v4 as uuidv4 } from 'uuid';

import { logger } from '../logger';

import {
  CreateMarkdownDocumentParams,
  EmbeddingStatus,
  ParsingStatus,
  UpdateEmbeddingStatusParams,
  UpdateFileTypeParams,
  UpdateParsingStatusParams,
  UserFile,
  UpdateFileExtensionAndMimeParams,
  UpdateBinaryInfoParams,
  UserDocument,
  FileType,
} from './types';
import { UpdateFileSizeParams } from './types/UpdateFileSizeParams';

const connection = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  searchPath: ['knex', 'public'],
});

const getUserFile = async (fileId: UserFile['id']) => {
  return await connection<UserFile>('user_files').where('id', fileId).first();
};

const createFileDetailsInDB = async ({
  file_name,
  file_size,
  organization_id,
  file_type,
  project_id,
}: {
  file_name: UserFile['file_name'];
  file_size: UserFile['file_size'];
  organization_id: UserFile['organization_id'];
  file_type: FileType;
  project_id: UserFile['project_id'];
}): Promise<
  Pick<UserFile, 'id' | 'file_name' | 'organization_id' | 'project_id'>[]
> => {
  return await connection<UserFile>('user_files')
    .returning(['id', 'file_name', 'organization_id', 'project_id'])
    .insert({
      file_name,
      file_size,
      organization_id,
      file_type,
      project_id,
    });
};

const updateFileBinaryInfo = async ({
  where: { fileId, orgId },
  data: { isBinary },
}: UpdateBinaryInfoParams) => {
  return await connection<UserFile>('user_files')
    .where({ id: fileId, organization_id: orgId })
    .update({
      is_binary_file: isBinary,
    });
};

const updateFileExtensionAndMime = async ({
  where: { fileId, orgId },
  data: { ext, mime },
}: UpdateFileExtensionAndMimeParams) => {
  return await connection<UserFile>('user_files')
    .where({ id: fileId, organization_id: orgId })
    .update({
      file_extension: ext,
      file_mime_type: mime,
    });
};

const updateFileType = async ({
  where: { fileId, orgId },
  data: { type },
}: UpdateFileTypeParams) => {
  return await connection<UserFile>('user_files')
    .where({ id: fileId, organization_id: orgId })
    .update({
      file_type: type,
    });
};

const updateEmbeddingStatus = async ({
  where: { fileId, orgId },
  data: { embedding_status },
}: UpdateEmbeddingStatusParams) => {
  let updateDate = {};
  if (embedding_status === EmbeddingStatus.STARTED) {
    updateDate = {
      embedding_started_at: new Date(),
    };
  } else if (embedding_status === EmbeddingStatus.COMPLETED) {
    updateDate = {
      embedding_completed_at: new Date(),
    };
  } else if (embedding_status === EmbeddingStatus.FAILED) {
    updateDate = {
      embedding_failed_at: new Date(),
    };
  }

  return await connection<UserFile>('user_files')
    .where({ id: fileId, organization_id: orgId })
    .update({
      embedding_status,
      ...updateDate,
    });
};

const updateParsingStatus = async ({
  where: { fileId, orgId },
  data: { parsing_status },
}: UpdateParsingStatusParams) => {
  let updateDate = {};
  if (parsing_status === ParsingStatus.STARTED) {
    updateDate = {
      parsing_started_at: new Date(),
    };
  } else if (parsing_status === ParsingStatus.COMPLETED) {
    updateDate = {
      parsing_completed_at: new Date(),
    };
  } else if (parsing_status === ParsingStatus.FAILED) {
    updateDate = {
      parsing_failed_at: new Date(),
    };
  }

  return await connection<UserFile>('user_files')
    .where({ id: fileId, organization_id: orgId })
    .update({
      parsing_status,
      ...updateDate,
    });
};

const createMarkdownDocument = async ({
  title,
  content,
  orgId,
  fileId,
  projectId,
}: CreateMarkdownDocumentParams): Promise<{ id: UserDocument['id'] }[]> => {
  return await connection<UserDocument>('user_documents')
    .returning('id')
    .insert({
      // user_documents.id has no DB-side default — the worker must supply it.
      // (The "ids cleanup" refactor dropped the old public_id column but the
      // new id column was never given a default, so omitting this field
      // produces a NOT NULL violation.)
      id: uuidv4(),
      title,
      content,
      organization_id: orgId,
      file_id: fileId,
      project_id: projectId,
    });
};

export const bindFileWithDocument = async (
  fileId: UserFile['id'],
  documentId: UserDocument['id'],
) => {
  return await connection<UserFile>('user_files').where({ id: fileId }).update({
    document_id: documentId,
  });
};

const updateFileSize = async ({
  where: { fileId, orgId },
  data: { fileSize },
}: UpdateFileSizeParams) => {
  return await connection<UserFile>('user_files')
    .where({ id: fileId, organization_id: orgId })
    .update({
      file_size: fileSize,
    });
};

const updateThumbnailKey = async ({
  where: { fileId, orgId },
  data: { thumbnailS3Key },
}: {
  where: { fileId: UserFile['id']; orgId: string };
  data: { thumbnailS3Key: string };
}) => {
  const updatedRows = await connection<UserFile>('user_files')
    .where({ id: fileId, organization_id: orgId })
    .update({
      thumbnail_s3_key: thumbnailS3Key,
    });

  if (updatedRows === 0) {
    throw new Error(
      `Failed to update thumbnail key: no matching file found (fileId=${fileId}, orgId=${orgId}, thumbnailS3Key=${thumbnailS3Key})`,
    );
  }

  return updatedRows;
};

/**
 * Reads the encrypted per-organization LiteLLM virtual key. Decryption is the
 * caller's responsibility (see `utils/decrypt-api-key.ts`). Returns null when
 * the org has no row in `organization_settings` or no key set, in which case
 * the caller should fall back to the LITELLM_MASTER_KEY.
 */
const getOrgLiteLLMKeyEncrypted = async (
  orgId: string,
): Promise<string | null> => {
  const row = await connection('organization_settings')
    .select('litellm_api_key')
    .where({ organization_id: orgId })
    .first<{ litellm_api_key: string | null } | undefined>();

  return row?.litellm_api_key ?? null;
};

/**
 * Merge-update the `metadata` JSONB column on a user_files row. Uses the
 * PostgreSQL `||` operator so existing keys (e.g. Google Drive import fields)
 * are preserved — only the keys present in `patch` are overwritten or added.
 */
const mergeFileMetadata = async ({
  where: { fileId, orgId },
  patch,
}: {
  where: { fileId: UserFile['id']; orgId: string };
  patch: Record<string, unknown>;
}) => {
  return await connection<UserFile>('user_files')
    .where({ id: fileId, organization_id: orgId })
    .update({
      metadata: connection.raw(`COALESCE(metadata, '{}'::jsonb) || ?::jsonb`, [
        JSON.stringify(patch),
      ]),
    });
};

/**
 * Insert a row into `security_events` (Phase 0.5 audit table owned by
 * ragen-app). The worker writes directly via Knex rather than cross-
 * importing ragen-app's feature module because:
 *
 *   1. The two repos don't share code via a package — relative imports
 *      across workspaces would be ugly and fragile.
 *   2. The event shape is stable (owned by ragen-app's Prisma schema);
 *      drift between the two producers would be caught by any missing
 *      column at the DB boundary rather than at type-check time.
 *
 * Fields match the Prisma `SecurityEvent` model 1:1. Enum columns
 * (`event_type`, `severity`) are stored as strings matching Postgres
 * enum values; Knex handles the enum cast transparently.
 *
 * Never throws — audit failures must not break ingestion. Returns
 * `null` on error so the caller can decide whether to continue.
 */
const createSecurityEvent = async (input: {
  eventType: string;
  severity: 'info' | 'warn' | 'critical';
  source: string;
  organizationId?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ publicId: string } | null> => {
  try {
    const [row] = await connection('security_events')
      .insert({
        public_id: uuidv4(),
        event_type: input.eventType,
        severity: input.severity,
        source: input.source,
        organization_id: input.organizationId ?? null,
        user_id: input.userId ?? null,
        ip_address: input.ipAddress ?? null,
        user_agent: input.userAgent ?? null,
        request_id: input.requestId ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
      })
      .returning<{ public_id: string }[]>('public_id');
    return { publicId: row.public_id };
  } catch (err) {
    logger.warn(
      { err, eventType: input.eventType, source: input.source },
      'Failed to create security event',
    );
    return null;
  }
};

type AiUsageStep =
  'EMBEDDINGS' | 'CHAT_COMPLETION' | 'REPHRASING' | 'MODERATION';

/**
 * Insert a row into `ai_usage`. Never throws — tracking failures must
 * not break ingestion. Mirrors ragen-app's `trackAiUsage` so the dashboard
 * query sees worker-originated usage (embeddings, summaries) in the same
 * shape as chat-originated usage.
 */
const trackAiUsage = async (input: {
  organizationId: string;
  projectId?: string | null;
  userId?: string | null;
  threadId?: string | null;
  step: AiUsageStep;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> => {
  try {
    await connection('ai_usage').insert({
      id: uuidv4(),
      organization_id: input.organizationId,
      project_id: input.projectId ?? null,
      user_id: input.userId ?? null,
      thread_id: input.threadId ?? null,
      step: input.step,
      provider: input.provider,
      model: input.model,
      input_tokens: Math.max(0, Math.trunc(input.inputTokens) || 0),
      output_tokens: Math.max(0, Math.trunc(input.outputTokens) || 0),
      total_tokens: Math.max(0, Math.trunc(input.totalTokens) || 0),
      estimated_cost: 0,
      duration_ms: input.durationMs ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
  } catch (err) {
    logger.warn(
      {
        err,
        organizationId: input.organizationId,
        step: input.step,
        model: input.model,
      },
      'Failed to track AI usage',
    );
  }
};

type CreditOperation =
  | 'ENRICH_REJESTRIO'
  | 'SCORE_LEAD_CRITERION'
  | 'SCORE_LEAD_DISQUALIFIER'
  | 'SCORE_LEAD_SINGLE_PROMPT';

/**
 * Atomically deduct credits and write a ledger entry. Mirrors ragen-app's
 * `spendCreditsCommand` schema 1:1 — the worker writes via Knex directly
 * because the two repos don't share code. Idempotency-key conflicts return
 * the prior balance without double-charging (Temporal retries safe).
 *
 * Returns `{ ok: false, reason: 'insufficient' }` when the balance is below
 * `amount` — callers should treat this as a soft failure (do not roll back
 * the enrichment that already succeeded; admin or trial top-up can resolve).
 */
const spendCredits = async (input: {
  organizationId: string;
  amount: number;
  operation: CreditOperation;
  referenceId?: string;
  userId?: string | null;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}): Promise<
  | { ok: true; balance: number; deduplicated: boolean }
  | { ok: false; reason: 'insufficient'; balance: number; required: number }
> => {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('spendCredits: amount must be a positive integer');
  }

  return await connection.transaction(async (trx) => {
    await trx.raw(
      `INSERT INTO org_credit_balances (organization_id, balance, lifetime_granted, lifetime_spent, updated_at)
       VALUES (?, 0, 0, 0, CURRENT_TIMESTAMP)
       ON CONFLICT (organization_id) DO NOTHING`,
      [input.organizationId],
    );
    const locked = await trx.raw<{
      rows: { balance: number; lifetime_spent: number }[];
    }>(
      `SELECT balance, lifetime_spent
       FROM org_credit_balances
       WHERE organization_id = ?
       FOR UPDATE`,
      [input.organizationId],
    );
    const current = locked.rows[0];
    if (!current) {
      throw new Error('Failed to lock credit balance row');
    }

    // Idempotency check runs after the org row lock so two concurrent
    // transactions with the same key can't both pass the check (TOCTOU).
    if (input.idempotencyKey) {
      const existing = await trx('credit_ledger_entries')
        .select('balance_after')
        .where({
          organization_id: input.organizationId,
          idempotency_key: input.idempotencyKey,
        })
        .first<{ balance_after: number } | undefined>();
      if (existing) {
        return {
          ok: true as const,
          balance: existing.balance_after,
          deduplicated: true,
        };
      }
    }
    if (current.balance < input.amount) {
      return {
        ok: false as const,
        reason: 'insufficient',
        balance: current.balance,
        required: input.amount,
      };
    }
    const newBalance = current.balance - input.amount;
    await trx('org_credit_balances')
      .where({ organization_id: input.organizationId })
      .update({
        balance: newBalance,
        lifetime_spent: current.lifetime_spent + input.amount,
        updated_at: new Date(),
      });
    await trx('credit_ledger_entries').insert({
      public_id: uuidv4(),
      organization_id: input.organizationId,
      user_id: input.userId ?? null,
      delta: -input.amount,
      balance_after: newBalance,
      reason: 'SPEND',
      operation: input.operation,
      reference_id: input.referenceId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    return { ok: true as const, balance: newBalance, deduplicated: false };
  });
};

const updatePageCount = async ({
  where: { fileId, orgId },
  data: { pageCount },
}: {
  where: { fileId: UserFile['id']; orgId: string };
  data: { pageCount: number };
}) => {
  return await connection<UserFile>('user_files')
    .where({ id: fileId, organization_id: orgId })
    .update({
      page_count: pageCount,
    });
};

export type PiiIngestionMode = 'destructive' | 'dual_content';

/**
 * Returns the PII ingestion mode for the org; defaults to 'destructive' if
 * the org has no row in `organization_settings` or the field is null.
 */
const getPiiIngestionMode = async (
  orgId: string,
): Promise<PiiIngestionMode> => {
  const row = await connection('organization_settings')
    .select('pii_ingestion_mode')
    .where({ organization_id: orgId })
    .first<{ pii_ingestion_mode: string | null } | undefined>();

  if (row?.pii_ingestion_mode === 'dual_content') {
    return 'dual_content';
  }
  return 'destructive';
};

/**
 * Returns the encrypted per-org PII DEK; returns null when the org has no row
 * in `organization_settings` or no DEK set, in which case dual-content mode
 * cannot be used and the caller should fall back to destructive mode.
 */
const getEncryptedPiiDek = async (orgId: string): Promise<string | null> => {
  const row = await connection('organization_settings')
    .select('encrypted_pii_dek')
    .where({ organization_id: orgId })
    .first<{ encrypted_pii_dek: string | null } | undefined>();

  return row?.encrypted_pii_dek ?? null;
};

/**
 * Seed version 1 for a freshly ingested document.
 *
 * Idempotent: the embeddings workflow can be replayed or retried, and a second
 * v1 would collide with the (document_id, version_number) unique constraint.
 * Returns 0 when the document already has any version.
 */
const createInitialDocumentVersion = async ({
  documentId,
  organizationId,
  content,
  title,
  authorId,
  ragScore,
}: {
  documentId: string;
  organizationId: string;
  content: string;
  title: string;
  authorId: string | null;
  ragScore: Record<string, unknown> | null;
}): Promise<number> => {
  const existing = await connection('document_versions')
    .where({ document_id: documentId })
    .count('id as count')
    .first();

  if (existing && Number(existing.count) > 0) {
    return 0;
  }

  await connection('document_versions').insert({
    id: uuidv4(),
    document_id: documentId,
    organization_id: organizationId,
    version_number: 1,
    content,
    title,
    rag_score: ragScore ? JSON.stringify(ragScore) : null,
    change_type: 'UPLOAD',
    author_id: authorId,
    is_active: true,
    created_at: new Date(),
  });

  return 1;
};

/**
 * Attach a freshly computed RAG score to whichever version is currently active.
 *
 * Scoring runs after the version row exists, so it cannot be written at insert
 * time. Returns the number of rows updated — zero means no active version,
 * which the caller reports rather than failing over.
 */
const updateActiveDocumentVersionRagScore = async ({
  documentId,
  orgId,
  ragScore,
}: {
  documentId: string;
  orgId: string;
  ragScore: Record<string, unknown>;
}): Promise<number> => {
  return connection('document_versions')
    // organization_id as well as document_id: a mismatched pair should update
    // nothing rather than trusting the caller's document id alone.
    .where({
      document_id: documentId,
      organization_id: orgId,
      is_active: true,
    })
    .update({ rag_score: JSON.stringify(ragScore) });
};

const mergeDocumentMetadata = async ({
  where: { documentId, orgId },
  patch,
}: {
  where: { documentId: string; orgId: string };
  patch: Record<string, unknown>;
}) => {
  return connection<UserDocument>('user_documents')
    .where({ id: documentId, organization_id: orgId })
    .update({
      // COALESCE because `||` against a NULL metadata yields NULL, which would
      // wipe the column instead of seeding it.
      metadata: connection.raw(`COALESCE(metadata, '{}'::jsonb) || ?::jsonb`, [
        JSON.stringify(patch),
      ]),
    });
};

/**
 * Patch scalar fields inside `metadata.optimizationJob` without touching the
 * suggestions array beside them — the user can still act on the previous run's
 * suggestions while a new one is in flight.
 */
const updateOptimizationJobFields = async ({
  documentId,
  orgId,
  fields,
}: {
  documentId: string;
  orgId: string;
  fields: Record<string, unknown>;
}) => {
  return connection<UserDocument>('user_documents')
    .where({ id: documentId, organization_id: orgId })
    .update({
      metadata: connection.raw(
        `jsonb_set(
          COALESCE(metadata, '{}'),
          '{optimizationJob}',
          COALESCE(metadata->'optimizationJob', '{}') || ?::jsonb
        )`,
        [JSON.stringify(fields)],
      ),
    });
};

const getUserDocument = async ({
  documentId,
  orgId,
}: {
  documentId: string;
  orgId: string;
}): Promise<{ content: string } | null> => {
  const row = await connection('user_documents')
    .where({ id: documentId, organization_id: orgId })
    .select('content')
    .first<{ content: string } | undefined>();
  return row ?? null;
};

/**
 * The suggestions the worker itself wrote, read back server-side.
 *
 * Applying is driven by ids, not by suggestion bodies from the browser: a
 * version stamped AI_OPTIMIZE should contain what the model proposed, not
 * whatever a client posted.
 */
const getOptimizationJobSuggestions = async ({
  documentId,
  orgId,
}: {
  documentId: string;
  orgId: string;
}): Promise<unknown[]> => {
  const row = await connection<UserDocument>('user_documents')
    .where({ id: documentId, organization_id: orgId })
    .select(
      connection.raw(
        `metadata->'optimizationJob'->'suggestions' AS suggestions`,
      ),
    )
    .first();
  const raw = (row as unknown as { suggestions: unknown })?.suggestions;
  return Array.isArray(raw) ? raw : [];
};

export const db = {
  getUserFile,
  getOrgLiteLLMKeyEncrypted,
  createFileDetailsInDB,
  updateFileBinaryInfo,
  updateParsingStatus,
  updateEmbeddingStatus,
  createMarkdownDocument,
  updateFileExtensionAndMime,
  updateFileType,
  bindFileWithDocument,
  updateFileSize,
  updateThumbnailKey,
  mergeFileMetadata,
  createSecurityEvent,
  trackAiUsage,
  spendCredits,
  updatePageCount,
  getPiiIngestionMode,
  getEncryptedPiiDek,
  createInitialDocumentVersion,
  updateActiveDocumentVersionRagScore,
  mergeDocumentMetadata,
  updateOptimizationJobFields,
  getUserDocument,
  getOptimizationJobSuggestions,
};
