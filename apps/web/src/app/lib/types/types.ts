export type PropsWihLocale = {
  params: Promise<{
    locale: string;
  }>;
};

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
  accessible_by?: string[];
};

export type VectorStoreMetadataFilter = Partial<VectorStoreDocumentMetadata>;
