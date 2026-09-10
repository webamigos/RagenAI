import type { RetrievedSource } from '@/libs/chains/types/common';
import type {
  ApiSseRetrieval,
  ApiSseRetrievedSource,
} from '../contracts/events.types';

/**
 * What the browser is told about retrieval, field by field.
 *
 * This exists because passing the chain's own object through was not the
 * same thing as sending the declared contract, and TypeScript could not say
 * so. `RetrievedSource` carries a `snippet` — up to 2 kB of document text,
 * kept for the analytics row — and `ApiSseRetrievedSource` does not declare
 * one. Excess-property checking only applies to object literals, so
 * `sources: retrieval.sources` type-checked and shipped the snippets to a
 * client that never read them.
 *
 * Writing the mapping out is what makes the contract enforceable: a field
 * added to the chain reaches the browser only if someone adds it here too,
 * and this file has a test.
 *
 * Each optional field is omitted rather than sent as `undefined` or
 * defaulted, because absence is what the receiving side reads. A missing
 * `relevanceScore` means reranking did not run; a missing `sourcePage` means
 * the parser could not say which page — neither is a zero.
 */
export function toRetrievalEventSource(
  source: RetrievedSource,
): ApiSseRetrievedSource {
  return {
    fileId: source.fileId,
    fileName: source.fileName,
    ...(source.relevanceScore !== undefined
      ? { relevanceScore: source.relevanceScore }
      : {}),
    ...(source.sourcePage !== undefined
      ? { sourcePage: source.sourcePage }
      : {}),
  };
}

export function toRetrievalEvent(retrieval: {
  sources: readonly RetrievedSource[];
  chunkCount: number;
  durationMs: number;
}): ApiSseRetrieval {
  return {
    sources: retrieval.sources.map(toRetrievalEventSource),
    chunkCount: retrieval.chunkCount,
    durationMs: retrieval.durationMs,
  };
}
