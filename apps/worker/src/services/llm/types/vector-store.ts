export type VectorStoreDocumentMetadata = {
  file_name: string;
  page_number: number;
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
