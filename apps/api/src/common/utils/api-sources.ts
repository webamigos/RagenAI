/** One document an answer was drawn from, as an API caller sees it. */
export type ApiSource = {
  fileId: string;
  /** Null when the chunk carried no file name (older ingests). */
  fileName: string | null;
  /** 1 is the most relevant, by the order retrieval ranked them. */
  rank: number;
};

/**
 * The sources of a finished turn. Failing to read them is a hole in an
 * optional field, never a failed answer the caller is already holding.
 */
export async function resolveApiSources(result: {
  sources: PromiseLike<{ fileId: string; fileName: string | null }[]>;
}): Promise<ApiSource[]> {
  let sources: { fileId: string; fileName: string | null }[] = [];
  try {
    sources = await result.sources;
  } catch {
    sources = [];
  }
  return sources.map(({ fileId, fileName }, index) => ({
    fileId,
    fileName,
    rank: index + 1,
  }));
}
