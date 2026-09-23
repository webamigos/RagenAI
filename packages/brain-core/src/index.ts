export { intersectPrincipals, isWidening } from './access/intersect-principals';
export {
  ExtractionBudget,
  type ExtractionBudgetLimits,
  type TokenUsage,
} from './extraction/budget';
export {
  DEFAULT_MAX_WINDOW_CHARS,
  describeFailure,
  describeIssues,
  extractDocument,
  type ExtractDocumentInput,
  type ExtractDocumentOutcome,
  type GenerateStructured,
} from './extraction/extract-document';
export {
  assembleCandidates,
  type AssembledCandidates,
  type CandidateEdge,
  type CandidatePage,
  type CandidateSource,
  type ExtractionSource,
} from './extraction/assemble';
export {
  extractionResultSchema,
  type ExtractionResult,
} from './extraction/schema';
export { EXTRACTION_SYSTEM_PROMPT } from './extraction/prompt';
export { QuoteIndex, normalizeForQuoteMatch } from './extraction/verify-quotes';
export { splitIntoWindows } from './extraction/windows';
export { quoteHash, sha256, slugify } from './text';
