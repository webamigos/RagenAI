export type VectorStoreDocumentMetadata = {
  file_name: string;
  /**
   * The chunk's 1-based ordinal within its file.
   *
   * Held the name `page_number` until gap 3 of the design-system-v2 spec, and
   * the design read it as a page. It never was one:
   * a twelve-page PDF split into forty chunks yielded "page 37". The rename is
   * the fix — a field whose name states what it holds cannot be rendered under
   * the wrong word by the next person who finds it.
   *
   * The real page is `source_page`, written only when the parser knows one.
   * Chunks already in Qdrant keep an inert `page_number`; nothing reads it, and
   * a re-index is what upgrades a document.
   */
  chunk_index: number;
  /**
   * The real page this chunk came from, 1-based.
   *
   * Absent when the parser could not say — every legacy loader, every
   * unpaginated format, and any chunk Docling's elements could not be matched
   * to. **Absence is the discriminator**: the UI shows "· page {n}" only when
   * this is present, so a chunk ingested before the field existed cannot be
   * labelled by a rule it predates. Do not default it.
   */
  source_page?: number;
  created_at: string;
  id: string;
  organization_id: string;
  file_id: string;
  project_id: string | null;
  source_type: string;
  chunk_size: number;
  chunk_overlap: number;
  word_count: number;
  previous_chunk_id: number;
  next_chunk_id: number;
  status: 'active' | 'archived';
  embedding_model: string;
  total_chunks: number;
  chunk_type?: 'summary';
  pii_policy?: 'NONE' | 'TOXIC_ONLY' | 'STRICT';
  pii_alert?: boolean;
  pii_detected_entities?: string[];
  pii_masked_entities?: string[];
  section_path?: string;
  sheet_name?: string;
  timestamp_start_ms?: number;
  timestamp_end_ms?: number;
  /** ISO 639-3 code detected by franc at ingest time. One value per document, shared by every chunk. */
  language?: string;
};

export type VectorStoreMetadataFilter = Partial<VectorStoreDocumentMetadata>;
