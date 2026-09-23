/**
 * What a chat source shows when the cited file is a published Brain page
 * (spec E8): the page, and the documents it was built from — only those the
 * reader may open.
 */
export type BrainCitation = {
  pageTitle: string;
  sources: { fileName: string; documentId: string | null; span: string }[];
};

/** Keyed by the cited file's id — the page's publication vehicle. */
export type BrainCitations = Record<string, BrainCitation>;
