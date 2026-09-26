/** Shared shapes for the RAG benchmark. See ../README.md for the why. */

/** Language of a question, or of the document that holds its answer. */
export type Lang = string;

export type QuestionType =
  | 'factual'
  | 'numeric'
  | 'comparative'
  | 'multi-hop'
  | 'cross-lingual'
  | 'guard-hallucination'
  | 'guard-sycophancy';

export interface CorpusDocument {
  /** Path to the file, relative to the corpus directory. */
  file: string;
  lang: Lang;
  mimeType: string;
  title?: string;
}

export interface Corpus {
  name: string;
  version: number;
  license: string;
  languages: Lang[];
  description?: string;
  whyInvented?: string;
  documents: CorpusDocument[];
}

export interface Question {
  id: string;
  /** Language the question is asked in. */
  lang: Lang;
  /** Language of the document holding the answer — differs from `lang` for cross-lingual cases. */
  docLang: Lang;
  /**
   * The corpus documents (`CorpusDocument.file`) that hold the answer — more
   * than one for a question that compares or combines two.
   *
   * What *should* be retrieved, as opposed to `CaseResult.citedFiles`, which is
   * what was. A per-document pass rate needs this as its denominator: a
   * retrieval miss cites nothing, so grouping by citations drops exactly the
   * failures. Absent on a `guard-hallucination` question, whose answer is in no
   * document, and on a corpus written before the field existed.
   */
  expectedFiles?: string[];
  type: QuestionType;
  question: string;
  /** Every string must appear in the answer. */
  expectAll?: string[];
  /** At least one string must appear. */
  expectAny?: string[];
  /** No string may appear — the distractor values from the other documents. */
  expectNone?: string[];
  /** Graded by an LLM judge through the same proxy the product uses. */
  rubric?: string;
  /**
   * Why this question is in the corpus, for a reader deciding whether a
   * failure is a regression or a question that was never fair.
   *
   * Not graded and not reported. It exists because a corpus built to expose
   * one specific failure — `tabele-bilingual-v1` and the header a split table
   * loses — is a set of numbers that look arbitrary without it.
   */
  why?: string;
}

/** Which pipeline answered. `no-rag` is the control: same model, no documents. */
export type Arm = 'rag' | 'no-rag';

export interface CaseResult {
  questionId: string;
  arm: Arm;
  lang: Lang;
  docLang: Lang;
  /** Copied from the question, so a result file can be sliced on its own. */
  expectedFiles?: string[];
  type: QuestionType;
  question: string;
  answer: string;
  /** Deterministic substring assertions. */
  assertionsPassed: boolean;
  assertionFailures: string[];
  /**
   * LLM judge. `null` when the question declares no rubric, and also when it
   * declares one the judge could not be read on — `rubricError` tells the two
   * apart, and the second makes the case ungraded.
   */
  rubricPassed: boolean | null;
  rubricReason?: string;
  /**
   * Why a declared rubric produced no verdict. A fact about the judge, not
   * about the answer, so `isUngraded()` keeps such a case out of every
   * denominator instead of scoring it a loss.
   */
  rubricError?: string;
  /** A case passes only when both gates pass. */
  passed: boolean;
  /** Files the answer cited, when the arm can report them. */
  citedFiles?: string[];
  error?: string;
  /**
   * Time for the answer alone — the pipeline turn, or the control call.
   * Separate from `durationMs` because that also covers the judge call, and a
   * number mixing the two is not a latency measurement of anything.
   */
  answerMs: number;
  /** Answer plus grading, i.e. the whole case. */
  durationMs: number;
}

export interface StackFingerprint {
  date: string;
  gitSha: string;
  chatModel: string;
  judgeModel: string;
  rephraseModel: string;
  embeddingsModel: string;
  vectorSize: string;
  rerankProvider: string;
  rerankModel: string;
  rerankingEnabled: string;
  multiQueryVariants: string;
  appUrl: string;
  /**
   * Which path the **app** served this run through — `litellm` or `native`,
   * asked of the app rather than read here. Without it the two arms of the
   * Phase B comparison produce indistinguishable reports.
   */
  llmGateway: string;
}

/**
 * The RAG readiness score ingest wrote for one corpus document
 * (`UserFile.metadata.ragScore`), read back after the run's own upload.
 *
 * Read, not recomputed: the question the score has to answer is whether the
 * number users see tracks retrieval, and that number is the one ingest wrote,
 * from the text ingest passed it. Scoring again from here would measure a
 * second call on a different string.
 */
export interface DocumentScore {
  /** `CorpusDocument.file`. */
  file: string;
  /**
   * - `scored` — ingest wrote a score
   * - `failed` — ingest ran the scorer and wrote `null`
   * - `missing` — nothing was written before the wait ran out, which is also
   *   what a scorer that threw leaves behind
   */
  state: 'scored' | 'failed' | 'missing';
  /** The model's `total`, as ingest stored it. */
  total?: number;
  dimensions?: Record<string, number>;
}

export interface Report {
  corpus: string;
  corpusVersion: number;
  fingerprint: StackFingerprint;
  results: CaseResult[];
  /** Absent on a run that uploaded nothing (`--arms no-rag`), and on older reports. */
  documentScores?: DocumentScore[];
}
