/** Extraction evidence is separate from indexing and reviewed-page coverage. */
export type BrainDocumentExtraction = {
  /** Includes rejected/stale pages: zero approved/candidates need not be empty. */
  hasPages: boolean;
  failure: { publicId: string; empty: boolean } | null;
};
