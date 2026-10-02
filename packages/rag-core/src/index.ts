export { encode, tokenize, fnv1a32, type SparseVector } from './bm25-encoder';

export {
  DENSE_VECTOR_NAME,
  SPARSE_VECTOR_NAME,
  BATCH_SIZE,
  PREFETCH_MULTIPLIER,
  PAYLOAD_INDEXES,
  DEFAULT_EMBEDDINGS_MODEL,
  DEFAULT_VECTOR_SIZE,
  VECTOR_SIZE,
  resolveEmbeddingsModel,
} from './vector-contract';

export {
  KNOWN_VECTOR_STORES,
  SUPPORTED_VECTOR_STORES,
  DEFAULT_VECTOR_STORE,
  isKnownVectorStore,
  isSupportedVectorStore,
  resolveDefaultVectorStore,
  type KnownVectorStore,
  type SupportedVectorStore,
} from './vector-store-backends';

export {
  EMBED_BATCH_SIZE,
  MAX_EMBEDDING_TEXT_CHARS,
  MAX_CONTEXT_PREFIX_CHARS,
  CONTEXT_PREFIX_IN_BM25,
  embeddingTextFor,
  truncateForEmbedding,
  prepareEmbeddingBatches,
  type TruncationReporter,
} from './embedding-contract';

export {
  CONTEXT_VERSION_PAYLOAD_FIELDS,
  CURRENT_CONTEXT_VERSION,
  FREE_CONTEXT_PREFIX_VERSION,
  countByVersion,
  fileContextVersions,
  type ContextPoint,
} from './context-versions';

export {
  MAX_SOURCE_REGIONS,
  readSourceRegions,
  type SourceRegion,
  type VectorStoreDocumentMetadata,
  type VectorStoreMetadataFilter,
} from './vector-metadata';

export {
  computeAccessiblePrincipals,
  type DocumentAccessGrant,
  type DocumentAccessInput,
} from './document-access';

export {
  findUndecodableText,
  isUndecodableText,
  type UndecodableTextReason,
} from './undecodable-text';

export {
  NON_PROSE_CHUNK_TYPES,
  chunksByIndexFilter,
  orderByChunkIndex,
  wantedChunkIndexes,
  type ChunksByIndexQuery,
} from './selection/chunks-by-index';

export {
  EXPANSION_BUDGET_MULTIPLIER,
  EXPANSION_RADIUS,
  expandHits,
  expandablePosition,
  joinTrimmingOverlap,
  mergeExpanded,
  planExpansion,
  type ExpandableChunk,
  type ExpandedSection,
  type ExpansionResult,
  type FetchChunksByIndex,
} from './selection/expansion';

export {
  SELECTION_CANDIDATE_CHARS,
  SELECTION_TIMEOUT_MS,
  buildSelectionPrompt,
  parseSelection,
  selectSections,
  type GenerateSelection,
  type SelectionFallbackReason,
  type SelectionPrompt,
  type SelectionResult,
} from './selection/select-sections';
