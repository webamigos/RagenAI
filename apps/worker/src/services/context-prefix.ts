import {
  FREE_CONTEXT_PREFIX_VERSION,
  MAX_CONTEXT_PREFIX_CHARS,
} from '@ragenai/rag-core';

import { type Document } from '../types/Document.js';

export { FREE_CONTEXT_PREFIX_VERSION };

const SUMMARY_SENTENCE_CHARS = 200;

/**
 * The free context prefix (spec 2026-09-29-contextual-chunks, A2): what a
 * reader would need to place a chunk, taken from what ingest already has —
 * the file's title, the chunk's section, and the first sentence of the
 * document's ADR-16 summary. No model call.
 *
 *   "Umowa serwisowa SLA — 4. Wynagrodzenie > 4.2 Terminy. Umowa określa…"
 *
 * The prefix is stored in the payload in plaintext, like `pageContent`, so it
 * carries nothing a reader of the collection cannot already see. The summary
 * was generated from the masked document. The title and the section are not
 * masked, but are no new exposure: the same point already stores them as
 * `file_name` and `section_path`.
 */
export function freeContextPrefix({
  fileName,
  sectionPath,
  summary,
}: {
  fileName: string;
  sectionPath?: string;
  summary?: string;
}): string {
  const title = titleOf(fileName);
  const head = sectionPath ? `${title} — ${sectionPath}` : title;
  const sentence = firstSentence(summary ?? '');
  const prefix = sentence ? `${head}. ${sentence}` : head;
  return prefix.slice(0, MAX_CONTEXT_PREFIX_CHARS).trim();
}

/** The file name as a person would read it: no extension, no separators. */
export function titleOf(fileName: string): string {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || fileName;
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  const end = trimmed.search(/[.!?](\s|$)/);
  const sentence = end === -1 ? trimmed : trimmed.slice(0, end + 1);
  return sentence.length > SUMMARY_SENTENCE_CHARS
    ? `${sentence.slice(0, SUMMARY_SENTENCE_CHARS).trimEnd()}…`
    : sentence;
}

/**
 * The body chunks with `contextPrefix` and `contextVersion` set; the summary
 * chunk is left alone — it is already the document-level context, and
 * prefixing it would embed the summary with a sentence of itself.
 */
export function withFreeContextPrefix(
  chunks: Document[],
  { fileName, summary }: { fileName: string; summary?: string },
): Document[] {
  return chunks.map((chunk) => {
    if (chunk.metadata?.chunk_type === 'summary') {
      return chunk;
    }
    const sectionPath =
      typeof chunk.metadata?.sectionPath === 'string'
        ? chunk.metadata.sectionPath
        : undefined;
    return {
      ...chunk,
      metadata: {
        ...chunk.metadata,
        contextPrefix: freeContextPrefix({ fileName, sectionPath, summary }),
        contextVersion: FREE_CONTEXT_PREFIX_VERSION,
      },
    };
  });
}
