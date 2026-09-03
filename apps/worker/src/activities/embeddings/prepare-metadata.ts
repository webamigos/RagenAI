import { type Document } from '../../types/Document';
import { type VectorStoreDocumentMetadata } from '../../services/llm/types/vector-store';
import { type FileType } from '../../types/UserFile';
import { type SplitterSettings } from '../../utils/splitters';
import { EMBEDDINGS_MODEL } from '../../consts';

type FileRecordInfo = {
  id: string;
  fileName: string;
  organizationId: string;
  projectId: string | null;
  piiPolicy?: 'NONE' | 'TOXIC_ONLY' | 'STRICT';
};

type Params = {
  docs: Document[];
  fileRecord: FileRecordInfo;
  fileType: FileType;
  splitterSettings: SplitterSettings;
};

export const prepareMetadata = async ({
  docs,
  fileRecord,
  fileType,
  splitterSettings,
}: Params) => {
  return await Promise.all(
    docs.map(async (doc, index) => {
      const text = doc.pageContent;
      // Preserve type-specific enrichment from the loaders/splitters:
      //   - ADR-16 summary chunk marker (chunk_type)
      //   - ADR-17 type-specific chunking metadata (sectionPath from DOCX,
      //     sheetName from XLSX, timestampStartMs/timestampEndMs from SRT)
      //
      // Intermediate metadata on the Document objects uses the camelCase
      // loader convention (matches fileName/fileType/source adjacent to
      // these fields). prepareMetadata is the boundary that maps them to
      // the snake_case VectorStoreDocumentMetadata shape that lands in
      // Qdrant. All other incoming metadata keys are intentionally dropped —
      // prepareMetadata owns the canonical vector-store metadata shape.
      const incoming = doc.metadata as
        | {
            chunk_type?: 'summary';
            sectionPath?: string;
            sheetName?: string;
            timestampStartMs?: number;
            timestampEndMs?: number;
            pii_alert?: boolean;
            pii_detected_entities?: string[];
            pii_masked_entities?: string[];
            pii_mode?: 'dual_content';
            content_original?: string;
          }
        | undefined;

      const metadata: VectorStoreDocumentMetadata = {
        file_name: fileRecord.fileName,
        file_id: fileRecord.id,
        page_number: index + 1,
        created_at: new Date().toISOString().split('T')[0],
        id: `${fileRecord.id}-${index}`,
        organization_id: fileRecord.organizationId,
        project_id: fileRecord.projectId,
        source_type: fileType,
        chunk_size: splitterSettings.chunkSize,
        chunk_overlap: splitterSettings.chunkOverlap,
        total_chunks: docs.length,
        word_count: text.split(/\s+/).length,
        // These store zero-based indices within this file's chunk array, not
        // composite IDs like the `id` field above. Named _id for historical
        // reasons (Qdrant metadata schema shared with apps/web).
        previous_chunk_id: index > 0 ? index - 1 : -1,
        next_chunk_id: index < docs.length - 1 ? index + 1 : -1,
        status: 'active',
        embedding_model: EMBEDDINGS_MODEL,
        pii_policy: fileRecord.piiPolicy ?? 'TOXIC_ONLY',
        ...(incoming?.pii_alert ? { pii_alert: true } : {}),
        ...(incoming?.pii_detected_entities
          ? { pii_detected_entities: incoming.pii_detected_entities }
          : {}),
        ...(incoming?.pii_masked_entities
          ? { pii_masked_entities: incoming.pii_masked_entities }
          : {}),
        ...(incoming?.chunk_type ? { chunk_type: incoming.chunk_type } : {}),
        ...(incoming?.sectionPath
          ? { section_path: incoming.sectionPath }
          : {}),
        ...(incoming?.sheetName ? { sheet_name: incoming.sheetName } : {}),
        ...(incoming?.timestampStartMs !== undefined
          ? { timestamp_start_ms: incoming.timestampStartMs }
          : {}),
        ...(incoming?.timestampEndMs !== undefined
          ? { timestamp_end_ms: incoming.timestampEndMs }
          : {}),
        ...(incoming?.pii_mode ? { pii_mode: incoming.pii_mode } : {}),
        ...(incoming?.content_original
          ? { content_original: incoming.content_original }
          : {}),
      };

      return {
        pageContent: text,
        metadata,
        embedding: [],
      };
    }),
  );
};
