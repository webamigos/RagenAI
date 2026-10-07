import type { BrainCitations } from '@ragenai/rag-core';

/** One document an answer was drawn from, as an API caller sees it. */
export type ApiSource = {
  fileId: string;
  /** Null when the chunk carried no file name (older ingests). */
  fileName: string | null;
  /** 1 is the most relevant, by the order retrieval ranked them. */
  rank: number;
  /**
   * Present when this file is a published Brain page: its title and the source
   * documents it was built from that the caller may open. A caller who may
   * read the page but none of its sources gets the page and an empty list,
   * never the names of documents they cannot open.
   */
  brain?: {
    pageTitle: string;
    sources: { fileName: string; span: string }[];
  };
};

/** Looks up the Brain pages among the cited files; see `getBrainCitations`. */
export type BrainLookup = (fileIds: string[]) => Promise<BrainCitations>;

/**
 * The sources of a finished turn. Failing to read them is a hole in an
 * optional field, never a failed answer the caller is already holding.
 */
export async function resolveApiSources(
  result: {
    sources: PromiseLike<{ fileId: string; fileName: string | null }[]>;
  },
  lookupBrain?: BrainLookup,
): Promise<ApiSource[]> {
  let sources: { fileId: string; fileName: string | null }[] = [];
  try {
    sources = await result.sources;
  } catch {
    sources = [];
  }
  // Optional and best-effort, like the sources themselves: a failed lookup
  // leaves the plain list.
  let pages: BrainCitations = {};
  if (lookupBrain && sources.length > 0) {
    try {
      pages = await lookupBrain(sources.map((s) => s.fileId));
    } catch {
      pages = {};
    }
  }
  return sources.map(({ fileId, fileName }, index) => {
    const page = pages[fileId];
    return {
      fileId,
      fileName,
      rank: index + 1,
      ...(page
        ? {
            brain: {
              pageTitle: page.pageTitle,
              sources: page.sources.map(({ fileName: name, span }) => ({
                fileName: name,
                span,
              })),
            },
          }
        : {}),
    };
  });
}
