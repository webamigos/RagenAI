export type PropsWihLocale = {
  params: {
    locale: string;
  };
};

export type VectorStoreDocumentMetadata = {
  file_name: string;
  page_number: number;
  created_at: string;
  id: number;
  organization_id: string;
  file_id: string;
  file_public_id?: string;
  project_id: number | null;
  source_type: string;
  chunk_size: number;
  chunk_overlap: number;
  word_count: number;
  previous_chunk_id: number;
  next_chunk_id: number;
  status: 'active' | 'archived';
  embedding_model: string;
  total_chunks: number;
};

export type VectorStoreMetadataFilter = Partial<VectorStoreDocumentMetadata>;
