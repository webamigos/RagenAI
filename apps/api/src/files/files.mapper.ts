import { fileId } from '../common/utils/openai-format.js';

/**
 * Row shape we pull from `UserFile`. We depend only on the fields we
 * actually need so Prisma's `select` / `findFirst` results can be fed
 * in without any ceremony.
 */
export type UserFileLike = {
  id: string;
  fileName: string;
  fileSize: number;
  createdAt: Date | null;
  parsingStatus: string;
  embeddingStatus: string;
};

/** OpenAI Files API `file` object. */
export type OpenAIFile = {
  id: string;
  object: 'file';
  bytes: number;
  created_at: number;
  filename: string;
  purpose: 'knowledge_base';
  status: 'uploaded' | 'processed' | 'error';
  status_details: string | null;
};

/**
 * Map our `parsing + embedding` status pair down to OpenAI's single
 * `status` enum:
 *   - both COMPLETED          → processed
 *   - either FAILED            → error
 *   - everything else          → uploaded (still in the pipeline)
 */
function mapStatus(parsing: string, embedding: string): OpenAIFile['status'] {
  if (parsing === 'COMPLETED' && embedding === 'COMPLETED') {
    return 'processed';
  }
  if (parsing === 'FAILED' || embedding === 'FAILED') {
    return 'error';
  }
  return 'uploaded';
}

/** `UserFile` → OpenAI `file` object. */
export function toOpenAIFile(row: UserFileLike): OpenAIFile {
  return {
    id: fileId(row.id),
    object: 'file',
    bytes: row.fileSize,
    created_at: row.createdAt ? Math.floor(row.createdAt.getTime() / 1000) : 0,
    filename: row.fileName,
    purpose: 'knowledge_base',
    status: mapStatus(row.parsingStatus, row.embeddingStatus),
    status_details: null,
  };
}
