/**
 * A per-run ceiling on extraction, in documents and in tokens (spec B4).
 *
 * "A computed limit is not a limit — a limit is a call site" (AGENTS.md): this
 * class is consulted by `extractDocument` before **every** model call and
 * charged after it, so the run stops at the ceiling instead of reporting that
 * it passed it. Each document is admitted first — `extractDocument` calls
 * `admitDocument` itself, so no caller can skip it — and one refused there
 * costs nothing.
 *
 * Tokens are charged as reported by the provider. A call in flight when the
 * ceiling is reached is allowed to finish, so a run can overshoot by at most
 * one call — bounded by the output cap the caller gives that call.
 */
export type ExtractionBudgetLimits = {
  maxDocuments: number;
  maxTokens: number;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export class ExtractionBudget {
  private documents = 0;
  private tokens = 0;

  constructor(private readonly limits: ExtractionBudgetLimits) {
    if (
      !Number.isFinite(limits.maxDocuments) ||
      !Number.isFinite(limits.maxTokens) ||
      limits.maxDocuments < 0 ||
      limits.maxTokens < 0
    ) {
      throw new RangeError('an extraction budget is two non-negative numbers');
    }
  }

  /** Reserve a document slot. False means the run is over. */
  admitDocument(): boolean {
    if (this.documents >= this.limits.maxDocuments || this.exhausted()) {
      return false;
    }
    this.documents += 1;
    return true;
  }

  /** Whether another model call may start. */
  allowsCall(): boolean {
    return !this.exhausted();
  }

  charge(usage: TokenUsage): void {
    this.tokens +=
      Math.max(0, usage.inputTokens) + Math.max(0, usage.outputTokens);
  }

  exhausted(): boolean {
    return this.tokens >= this.limits.maxTokens;
  }

  snapshot(): { documents: number; tokens: number } & ExtractionBudgetLimits {
    return { documents: this.documents, tokens: this.tokens, ...this.limits };
  }
}
