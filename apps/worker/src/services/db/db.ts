import { logger } from '../logger';
import {
  Prisma,
  type SecurityEventSeverity,
  type SecurityEventType,
} from '../../../generated/prisma';
import { getPrisma } from './prisma';

import {
  type CreateMarkdownDocumentParams,
  EmbeddingStatus,
  ParsingStatus,
  type UpdateEmbeddingStatusParams,
  type UpdateFileTypeParams,
  type UpdateParsingStatusParams,
  type UserFile,
  type UpdateFileExtensionAndMimeParams,
  type UpdateBinaryInfoParams,
  type UserDocument,
  type FileType,
} from './types';
import { type UpdateFileSizeParams } from './types/UpdateFileSizeParams';

/**
 * On Prisma (ADR-40 step 2).
 *
 * `findUnique` on the `@@unique([id, organizationId])` key rather than
 * `findFirst` with two equality filters: the org is part of the key being
 * looked up, so the scope cannot be dropped by editing a `where` clause.
 *
 * The returned row is Prisma's, so its fields are camelCase where the knex
 * one's were snake_case, and a miss is `null` rather than `undefined`. Both
 * consumers were updated; nothing serialises this into a Temporal payload
 * today (`getFileRecord` is registered but no workflow calls it).
 */
const getUserFile = async (fileId: string, orgId: string) => {
  return await getPrisma().userFile.findUnique({
    where: { id_organizationId: { id: fileId, organizationId: orgId } },
  });
};

/**
 * What `createFileDetailsInDB` hands back.
 *
 * Written out rather than `Pick<UserFile, …>`, because it deliberately is not
 * the row's shape: `scrape-website` reads these keys out of Temporal history,
 * so they stay snake_case while the row's fields are camelCase. Expressing it
 * as a slice of the model would have been a lie that happened to compile.
 */
type CreatedFileRow = {
  id: string;
  file_name: string;
  organization_id: string;
  project_id: string | null;
};

const createFileDetailsInDB = async ({
  file_name,
  file_size,
  organization_id,
  file_type,
  project_id,
}: {
  file_name: UserFile['fileName'];
  file_size: UserFile['fileSize'];
  organization_id: UserFile['organizationId'];
  file_type: FileType;
  project_id: UserFile['projectId'];
}): Promise<CreatedFileRow[]> => {
  const row = await getPrisma().userFile.create({
    data: {
      fileName: file_name,
      fileSize: file_size,
      organizationId: organization_id,
      fileType: file_type,
      projectId: project_id,
    },
    select: {
      id: true,
      fileName: true,
      organizationId: true,
      projectId: true,
    },
  });

  // Mapped back to the snake_case keys, and returned as a one-element array,
  // because this is an activity result that a workflow reads:
  // `scrape-website.ts` destructures the array and then reads `file_name`,
  // `organization_id` and `project_id` off it. Those keys are in the Temporal
  // history of every run that has not finished, so a workflow replaying
  // against a camelCase shape would read `undefined` — renaming them needs a
  // workflow-compatibility plan, not a rename.
  return [
    {
      id: row.id,
      file_name: row.fileName,
      organization_id: row.organizationId,
      project_id: row.projectId,
    },
  ];
};

const updateFileBinaryInfo = async ({
  where: { fileId, orgId },
  data: { isBinary },
}: UpdateBinaryInfoParams) => {
  const { count } = await getPrisma().userFile.updateMany({
    where: { id: fileId, organizationId: orgId },
    data: { isBinaryFile: isBinary },
  });

  return count;
};

const updateFileExtensionAndMime = async ({
  where: { fileId, orgId },
  data: { ext, mime },
}: UpdateFileExtensionAndMimeParams) => {
  const { count } = await getPrisma().userFile.updateMany({
    where: { id: fileId, organizationId: orgId },
    data: { fileExtension: ext, fileMimeType: mime },
  });

  return count;
};

const updateFileType = async ({
  where: { fileId, orgId },
  data: { type },
}: UpdateFileTypeParams) => {
  const { count } = await getPrisma().userFile.updateMany({
    where: { id: fileId, organizationId: orgId },
    data: { fileType: type },
  });

  return count;
};

const updateEmbeddingStatus = async ({
  where: { fileId, orgId },
  data: { embedding_status },
}: UpdateEmbeddingStatusParams) => {
  let updateDate = {};
  if (embedding_status === EmbeddingStatus.STARTED) {
    updateDate = {
      embeddingStartedAt: new Date(),
    };
  } else if (embedding_status === EmbeddingStatus.COMPLETED) {
    updateDate = {
      embeddingCompletedAt: new Date(),
    };
  } else if (embedding_status === EmbeddingStatus.FAILED) {
    updateDate = {
      embeddingFailedAt: new Date(),
    };
  }

  const { count } = await getPrisma().userFile.updateMany({
    where: { id: fileId, organizationId: orgId },
    data: { embeddingStatus: embedding_status, ...updateDate },
  });

  return count;
};

const updateParsingStatus = async ({
  where: { fileId, orgId },
  data: { parsing_status },
}: UpdateParsingStatusParams) => {
  let updateDate = {};
  if (parsing_status === ParsingStatus.STARTED) {
    updateDate = {
      parsingStartedAt: new Date(),
    };
  } else if (parsing_status === ParsingStatus.COMPLETED) {
    updateDate = {
      parsingCompletedAt: new Date(),
    };
  } else if (parsing_status === ParsingStatus.FAILED) {
    updateDate = {
      parsingFailedAt: new Date(),
    };
  }

  const { count } = await getPrisma().userFile.updateMany({
    where: { id: fileId, organizationId: orgId },
    data: { parsingStatus: parsing_status, ...updateDate },
  });

  return count;
};

const createMarkdownDocument = async ({
  title,
  content,
  orgId,
  fileId,
  projectId,
}: CreateMarkdownDocumentParams): Promise<{ id: UserDocument['id'] }[]> => {
  // The id is no longer supplied by hand. `user_documents.id` has no DB-side
  // default — the note that used to be here was right — but the schema
  // declares `@default(uuid())`, which Prisma generates client-side and sends
  // with the insert. The NOT NULL constraint is satisfied the same way, from a
  // declaration rather than from a call every writer has to remember.
  const row = await getPrisma().userDocument.create({
    data: {
      title,
      content,
      organizationId: orgId,
      fileId,
      projectId,
    },
    select: { id: true },
  });

  // An array, because two workflows destructure it as one.
  return [row];
};

export const bindFileWithDocument = async (
  fileId: UserFile['id'],
  documentId: UserDocument['id'],
  orgId: UserFile['organizationId'],
) => {
  const { count } = await getPrisma().userFile.updateMany({
    where: { id: fileId, organizationId: orgId },
    data: { documentId },
  });

  return count;
};

const updateFileSize = async ({
  where: { fileId, orgId },
  data: { fileSize },
}: UpdateFileSizeParams) => {
  const { count } = await getPrisma().userFile.updateMany({
    where: { id: fileId, organizationId: orgId },
    data: { fileSize },
  });

  return count;
};

/**
 * scrapeWebsite creates its UserFile row mid-workflow (unlike
 * runFileEmbeddings, whose caller already knows the fileId at workflow-start
 * time and persists workflowId itself from apps/web) — so this is the one
 * write path that has to happen from inside the worker, using the
 * workflow's own id via `workflowInfo().workflowId`. Enables
 * cancelFileEmbeddingCommand to find this run by fileId later.
 */
const updateWorkflowId = async ({
  where: { fileId, orgId },
  data: { workflowId },
}: {
  where: { fileId: UserFile['id']; orgId: string };
  data: { workflowId: string };
}) => {
  const { count } = await getPrisma().userFile.updateMany({
    where: { id: fileId, organizationId: orgId },
    data: { workflowId },
  });

  return count;
};

const updateThumbnailKey = async ({
  where: { fileId, orgId },
  data: { thumbnailS3Key },
}: {
  where: { fileId: UserFile['id']; orgId: string };
  data: { thumbnailS3Key: string };
}) => {
  // `updateMany` rather than `update`: this returns a row count, and the
  // caller's contract is that count plus a thrown error when it is zero.
  // `update` would throw Prisma's own P2025 instead, losing the message that
  // says which file and org were looked for.
  const { count: updatedRows } = await getPrisma().userFile.updateMany({
    where: { id: fileId, organizationId: orgId },
    data: { thumbnailS3Key },
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
  const row = await getPrisma().organizationSettings.findUnique({
    where: { organizationId: orgId },
    select: { litellmApiKey: true },
  });

  return row?.litellmApiKey ?? null;
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
  // Raw SQL rather than a Prisma `update`, and deliberately so — see the note
  // above `mergeDocumentMetadata`.
  return await getPrisma().$executeRaw`
    UPDATE user_files
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
    WHERE id = ${fileId}::uuid
      AND organization_id = ${orgId}
  `;
};

/**
 * Insert a row into `security_events`, the audit table apps/web owns.
 *
 * The worker writes it directly rather than calling apps/web's feature module,
 * because the two do not share application code — only the schema. That used
 * to come with a caveat: the row was assembled by hand, so drift between the
 * two producers would have surfaced as a missing column at the database
 * boundary rather than at type-check time. Generating both clients from the
 * one schema removes it — a column that moves now breaks the build here.
 *
 * Never throws. An audit failure must not break ingestion, so it returns
 * `null` and lets the caller decide whether to continue.
 */
const createSecurityEvent = async (input: {
  // Typed against the schema's enums rather than as free strings. The values
  // the one caller passes were already valid — the looseness was in the
  // signature, and Prisma's generated types close it.
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  source: string;
  organizationId?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ publicId: string } | null> => {
  try {
    // `public_id` is no longer generated here: the schema declares
    // `@default(uuid())` and Prisma supplies it, the same as
    // `createMarkdownDocument` in step 3d.
    const row = await getPrisma().securityEvent.create({
      data: {
        eventType: input.eventType,
        severity: input.severity,
        source: input.source,
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
        // The object, not `JSON.stringify`. The column is non-nullable with a
        // `{}` default, so absence is an empty object rather than `DbNull`.
        metadata: input.metadata ?? {},
      },
      select: { publicId: true },
    });

    return { publicId: row.publicId };
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
 * not break ingestion. Mirrors apps/web's `trackAiUsage` so the dashboard
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
    await getPrisma().aiUsage.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        userId: input.userId ?? null,
        threadId: input.threadId ?? null,
        step: input.step,
        provider: input.provider,
        model: input.model,
        inputTokens: Math.max(0, Math.trunc(input.inputTokens) || 0),
        outputTokens: Math.max(0, Math.trunc(input.outputTokens) || 0),
        totalTokens: Math.max(0, Math.trunc(input.totalTokens) || 0),
        estimatedCost: 0,
        durationMs: input.durationMs ?? null,
        // The object rather than `JSON.stringify`, and `DbNull` rather than
        // `null` — see the note in createInitialDocumentVersion.
        metadata: input.metadata ?? Prisma.DbNull,
      },
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

const updatePageCount = async ({
  where: { fileId, orgId },
  data: { pageCount },
}: {
  where: { fileId: UserFile['id']; orgId: string };
  data: { pageCount: number };
}) => {
  const { count } = await getPrisma().userFile.updateMany({
    where: { id: fileId, organizationId: orgId },
    data: { pageCount },
  });

  return count;
};

const updateLanguage = async ({
  where: { fileId, orgId },
  data: { language },
}: {
  where: { fileId: UserFile['id']; orgId: string };
  data: { language: string | null };
}) => {
  const { count } = await getPrisma().userFile.updateMany({
    where: { id: fileId, organizationId: orgId },
    data: { language },
  });

  return count;
};

export type PiiIngestionMode = 'destructive' | 'dual_content';

/**
 * Returns the PII ingestion mode for the org; defaults to 'destructive' if
 * the org has no row in `organization_settings` or the field is null.
 */
const getPiiIngestionMode = async (
  orgId: string,
): Promise<PiiIngestionMode> => {
  const row = await getPrisma().organizationSettings.findUnique({
    where: { organizationId: orgId },
    select: { piiIngestionMode: true },
  });

  if (row?.piiIngestionMode === 'dual_content') {
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
  const row = await getPrisma().organizationSettings.findUnique({
    where: { organizationId: orgId },
    select: { encryptedPiiDek: true },
  });

  return row?.encryptedPiiDek ?? null;
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
  // The knex version counted by `document_id` alone. `DocumentVersion` is a
  // tenant-scoped model, so that read would now trip the guard — and scoping
  // it is also the more correct question to ask, since the row this inserts
  // carries both columns anyway.
  const existing = await getPrisma().documentVersion.count({
    where: { documentId, organizationId },
  });

  if (existing > 0) {
    return 0;
  }

  await getPrisma().documentVersion.create({
    data: {
      documentId,
      organizationId,
      versionNumber: 1,
      content,
      title,
      // Two translations in one line. A Json column takes the value, not a
      // string: knex needed `JSON.stringify`, and giving Prisma a string would
      // store a JSON *string literal* that every reader gets back quoted.
      //
      // And absence is `Prisma.DbNull`, not `null`. Prisma distinguishes SQL
      // NULL (`DbNull`) from the JSON value `null` (`JsonNull`) and refuses a
      // bare `null` so the choice has to be made. knex wrote SQL NULL, so this
      // does too — `JsonNull` would make `rag_score IS NULL` stop matching.
      ragScore: ragScore ?? Prisma.DbNull,
      changeType: 'UPLOAD',
      authorId,
      isActive: true,
    },
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
  // organizationId as well as documentId: a mismatched pair should update
  // nothing rather than trusting the caller's document id alone.
  const { count } = await getPrisma().documentVersion.updateMany({
    where: { documentId, organizationId: orgId, isActive: true },
    data: { ragScore },
  });

  return count;
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
  return await getPrisma().$executeRaw`
    UPDATE user_documents
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{optimizationJob}',
      COALESCE(metadata->'optimizationJob', '{}'::jsonb) || ${JSON.stringify(fields)}::jsonb
    )
    WHERE id = ${documentId}::uuid
      AND organization_id = ${orgId}
  `;
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
  // The knex version pushed the JSON path into SQL
  // (`metadata->'optimizationJob'->'suggestions'`). Prisma has no typed
  // equivalent for reading a nested path, so the column comes back whole and
  // is walked here. That is more bytes for one row, which is the right trade
  // against a `$queryRaw` that would reintroduce a hand-written table name —
  // the thing this migration exists to remove.
  const row = await getPrisma().userDocument.findUnique({
    where: { id_organizationId: { id: documentId, organizationId: orgId } },
    select: { metadata: true },
  });

  const job = (
    row?.metadata as { optimizationJob?: { suggestions?: unknown } } | null
  )?.optimizationJob;

  return Array.isArray(job?.suggestions) ? job.suggestions : [];
};

/**
 * Delete an organization's threads whose last activity predates `staleBefore`,
 * with the rows that hang off them.
 *
 * **The order is the whole point, and the obvious shortcut is wrong.** There is
 * no cascade from a thread to its messages: `0_init` declares
 * `messages_thread_id_fkey ... ON DELETE SET NULL`, so deleting a thread
 * *detaches* its messages instead of removing them. They would survive as
 * orphans holding their encrypted content while `threads.encrypted_dek` — the
 * only key that could read them — goes away with the thread row. Permanently
 * unreadable rows, accumulating nightly, which is the opposite of what a
 * cleanup job is for. `document_citations` cascade from `messages`, not from
 * `threads`, so they only go when the messages do.
 *
 * This mirrors `ThreadCoreService.deleteThread` in apps/api (messages, then
 * thread documents, then the thread) — deliberately, so the two paths cannot
 * drift into deleting different things. It does not reuse that route: it sits
 * behind `SessionAuthGuard` and needs a user's bearer token, which the worker
 * has no way to mint.
 *
 * Staleness is measured from the newest message, falling back to the thread's
 * own `created_at` for a thread nobody wrote in. `threads` has no `updated_at`
 * column, so a plain `created_at < cutoff` would delete a conversation that
 * started before the cutoff and is still being typed into — during a live
 * demo, which is exactly when it would be noticed.
 */
const deleteStaleThreads = async (
  organizationId: string,
  staleBefore: Date,
): Promise<{ threadsDeleted: number; messagesDeleted: number }> => {
  return await getPrisma().$transaction(async (tx) => {
    /**
     * The staleness question, asked twice: once to pick candidates and once
     * under the lock to confirm they are still stale.
     *
     * Raw because Prisma cannot express it. It is a LEFT JOIN aggregated per
     * thread with a HAVING over `COALESCE(MAX(m.created_at), t.created_at)` —
     * newest message, falling back to the thread's own creation for a thread
     * nobody wrote in. `threads` has no `updated_at`, so a plain
     * `created_at < cutoff` would delete a conversation that started before
     * the cutoff and is still being typed into.
     *
     * `= ANY(…::uuid[])` rather than `IN (…)`: the ids bind as one array
     * parameter, which casts cleanly against a uuid column.
     */
    const staleAmong = async (ids: string[] | null): Promise<string[]> => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT t.id
        FROM threads t
        LEFT JOIN messages m ON m.thread_id = t.id
        WHERE t.organization_id = ${organizationId}
          ${ids === null ? Prisma.empty : Prisma.sql`AND t.id = ANY(${ids}::uuid[])`}
        GROUP BY t.id, t.created_at
        HAVING COALESCE(MAX(m.created_at), t.created_at) < ${staleBefore}
      `;

      return rows.map((row) => row.id);
    };

    const candidateIds = await staleAmong(null);

    if (candidateIds.length === 0) {
      return { threadsDeleted: 0, messagesDeleted: 0 };
    }

    // Lock the candidates, then ask again whether they are still stale.
    //
    // The default isolation is READ COMMITTED, so between the selection above
    // and the deletes below a visitor can send a message into a thread this
    // transaction has already decided is abandoned. Without the lock that
    // message is either deleted along with the thread, or — worse, and the
    // exact failure this function exists to prevent — survives the message
    // delete and is orphaned by ON DELETE SET NULL when the thread goes.
    //
    // FOR UPDATE is what closes it: inserting a message takes FOR KEY SHARE
    // on the referenced thread row to enforce the foreign key, and that
    // conflicts with FOR UPDATE. So holding it blocks new messages for these
    // threads until this transaction ends. Ordered by id so two runs cannot
    // take the same rows in opposite orders and deadlock.
    //
    // Raw because Prisma has no row-locking API at all.
    await tx.$queryRaw`
      SELECT id
      FROM threads
      WHERE organization_id = ${organizationId}
        AND id = ANY(${candidateIds}::uuid[])
      ORDER BY id
      FOR UPDATE
    `;

    const threadIds = await staleAmong(candidateIds);

    if (threadIds.length === 0) {
      return { threadsDeleted: 0, messagesDeleted: 0 };
    }

    // The order is the whole point, and the obvious shortcut is wrong. There
    // is no cascade from a thread to its messages: `0_init` declares
    // `messages_thread_id_fkey … ON DELETE SET NULL`, so deleting a thread
    // *detaches* its messages instead of removing them. They would survive as
    // orphans holding their encrypted content while `threads.encrypted_dek` —
    // the only key that could read them — goes away with the thread row.
    // `document_citations` cascade from `messages`, not from `threads`, so
    // they only go when the messages do.
    const { count: messagesDeleted } = await tx.message.deleteMany({
      where: { threadId: { in: threadIds } },
    });

    await tx.threadDocument.deleteMany({
      where: { threadId: { in: threadIds } },
    });

    // Scoped by organizationId as well as id. The ids already came from an
    // org-scoped query, so this is belt and braces — but `Thread` is a
    // tenant-scoped model, and a delete without its org filter is exactly what
    // the guard exists to catch.
    const { count: threadsDeleted } = await tx.thread.deleteMany({
      where: { id: { in: threadIds }, organizationId },
    });

    return { threadsDeleted, messagesDeleted };
  });
};

/**
 * Put the demo organization's restrictions back, whatever a visitor did to
 * them during the day.
 *
 * An upsert of exactly the columns the seed writes — `featureOverrides` and
 * `monthlyCostLimitCents` — and nothing else. `allowedModels` is set by the
 * operator in the admin panel and must survive the night, and the assistant
 * settings are already frozen by the `manageOrganizationSettings` override
 * this restores. Widening this to "reset the row" would undo operator
 * choices along with visitor damage.
 *
 * `featureOverrides` takes the object, not `JSON.stringify` of it: it is a
 * Json column, and the string form would store a JSON *string* that
 * `sanitizeFeatureOverrides` then reads as having no keys at all — which is
 * the demo tenant silently writable, the exact failure this exists to prevent.
 */
const restoreOrganizationRestrictions = async (
  organizationId: string,
  restrictions: {
    featureOverrides: Record<string, boolean>;
    monthlyCostLimitCents: number;
  },
): Promise<void> => {
  const data = {
    featureOverrides: restrictions.featureOverrides,
    monthlyCostLimitCents: restrictions.monthlyCostLimitCents,
  };

  await getPrisma().organizationSettings.upsert({
    where: { organizationId },
    update: data,
    create: { organizationId, ...data },
  });
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
  updateWorkflowId,
  updateThumbnailKey,
  mergeFileMetadata,
  createSecurityEvent,
  trackAiUsage,
  updatePageCount,
  updateLanguage,
  getPiiIngestionMode,
  getEncryptedPiiDek,
  createInitialDocumentVersion,
  updateActiveDocumentVersionRagScore,
  updateOptimizationJobFields,
  getOptimizationJobSuggestions,
  deleteStaleThreads,
  restoreOrganizationRestrictions,
};
