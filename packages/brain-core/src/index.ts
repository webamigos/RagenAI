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
  type UnverifiedClaim,
} from './extraction/assemble';
export {
  EXTRACTION_LIMITS,
  extractionProviderSchema,
  extractionResultSchema,
  parseExtraction,
  type ExtractionResult,
  type ParsedExtraction,
} from './extraction/schema';
export { EXTRACTION_SYSTEM_PROMPT, languageName } from './extraction/prompt';
export {
  compatibilityFold,
  QuoteIndex,
  normalizeForQuoteMatch,
} from './extraction/verify-quotes';
export { splitIntoWindows } from './extraction/windows';
export { findTables, type TableBlock } from './extraction/tables';
export { quoteHash, sha256, slugify } from './text';
export { addIsoDuration } from './findings/duration';
export {
  COMPUTED_FINDING_TYPES,
  CURATED_PAGE_STATUSES,
  detectPageFindings,
  verificationDue,
  type ComputedFindingType,
  type DesiredFinding,
  type FindingDetail,
  type FindingSeverity,
  type FindingsSnapshot,
  type SnapshotFile,
  type SnapshotPage,
  type SnapshotSource,
  type StaleReason,
} from './findings/page-findings';
export {
  reconcileFindings,
  type ExistingFinding,
  type FindingsPlan,
  type FindingStatus,
} from './findings/reconcile';
export {
  assembleGraph,
  ORIGIN_WEIGHT,
  type GraphEdgeInput,
  type GraphPageInput,
  type GraphStats,
} from './graph/assemble-graph';
export {
  contradictionPairs,
  type ContradictionPageInput,
} from './contradictions/pairs';
export {
  CONTRADICTION_SYSTEM_PROMPT,
  contradictionProviderSchema,
  contradictionUserPrompt,
  judgeContradictions,
  MAX_CLAIMS_PER_SIDE,
  MAX_CONTRADICTIONS_PER_PAIR,
  type JudgedClaim,
  type JudgedContradiction,
  type JudgedPage,
  type JudgeOutcome,
} from './contradictions/judge';
export {
  mergePageContent,
  type MergeablePage,
  type MergedContent,
  type MergeSource,
} from './review/merge-pages';
export {
  GRAPH_BUDGETS,
  selectGraphView,
  type GraphBudget,
  type GraphView,
  type GraphViewOptions,
} from './graph/select-view';
