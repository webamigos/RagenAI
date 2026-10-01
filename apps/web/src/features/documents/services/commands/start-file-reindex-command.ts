import db from '@ragenai/prisma-client';
import { ChangeType } from '@/generated/prisma/client';
import { jobs } from '@/libs/jobs';
import { Workflow } from '@/features/documents/contracts/document.types';

/** What a re-embed needs to know about the file it restarts. */
export interface ReindexableFile {
  id: string;
  fileName: string;
  projectId: string | null;
}

/** The document's active version, when the file has a document at all. */
export interface ActiveVersion {
  documentId: string;
  changeType: ChangeType;
}

export type ReindexJob =
  | typeof Workflow.RUN_FILE_EMBEDDINGS
  | typeof Workflow.REINDEX_DOCUMENT_VERSION;

/**
 * Which job re-embeds a file without changing what it says.
 *
 * `runFileEmbeddings` re-parses the stored file, which still holds the
 * original upload. That is right while the active version *is* the upload,
 * and wrong once it is an edit, an optimization, a rewrite or a rollback:
 * the index would go back to the original text while the document shows the
 * new one (AGENTS.md, "Document Versions & RAG Optimization"). Those go
 * through `reindexDocumentVersion`, which embeds the active version's text —
 * and masks it under the file's current PII policy, read from the row, so a
 * policy change re-embeds an edited document correctly too.
 */
export function reindexJobFor(active: ActiveVersion | null): ReindexJob {
  return active && active.changeType !== ChangeType.UPLOAD
    ? Workflow.REINDEX_DOCUMENT_VERSION
    : Workflow.RUN_FILE_EMBEDDINGS;
}

/**
 * Start the re-embed of one file with the job `reindexJobFor` picks, under a
 * run id the caller has already written to the row (every producer persists
 * before it enqueues). Returns the job it started.
 *
 * The one place the re-embed paths decide this — the single-file action, the
 * bulk action and the folder PII-policy re-embed — so they cannot drift.
 */
export async function startFileReindexCommand({
  file,
  organizationId,
  workflowId,
  userId = null,
}: {
  file: ReindexableFile;
  organizationId: string;
  workflowId: string;
  userId?: string | null;
}): Promise<ReindexJob> {
  const active = await db.documentVersion.findFirst({
    where: {
      organizationId,
      isActive: true,
      document: { fileId: file.id, organizationId },
    },
    select: { documentId: true, changeType: true },
  });

  const job = reindexJobFor(active);
  if (job === Workflow.REINDEX_DOCUMENT_VERSION && active) {
    await jobs().start(Workflow.REINDEX_DOCUMENT_VERSION, workflowId, {
      orgId: organizationId,
      fileId: file.id,
      fileName: file.fileName,
      projectId: file.projectId,
      userId,
      documentId: active.documentId,
    });
  } else {
    await jobs().start(Workflow.RUN_FILE_EMBEDDINGS, workflowId, {
      fileId: file.id,
      orgId: organizationId,
    });
  }
  return job;
}
