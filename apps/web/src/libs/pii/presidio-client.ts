export interface AnonymizeResult {
  maskedText: string;
  aliasMap: Record<string, string>;
}

interface PresidioAnalyzerResult {
  entity_type: string;
  start: number;
  end: number;
  score: number;
}

const EXCLUDED_ENTITY_TYPES = new Set(['URL']);

class PresidioClient {
  private analyzerUrl: string;

  constructor() {
    this.analyzerUrl =
      process.env.PRESIDIO_ANALYZER_URL ?? 'http://localhost:5002';
  }

  async anonymize(text: string, language: string): Promise<AnonymizeResult> {
    let analyzerResults: PresidioAnalyzerResult[];
    try {
      const controller = new AbortController();
      // 5s was too tight: spaCy pl_core_news_md + the full recognizer set
      // routinely blow past it on cold start, causing fail-closed aborts on
      // the first chat turn after a deploy.
      const timeoutMs = Number(process.env.PRESIDIO_TIMEOUT_MS) || 15_000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let analyzeResponse: Response;
      try {
        analyzeResponse = await fetch(`${this.analyzerUrl}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, language }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!analyzeResponse.ok) {
        throw new Error(`status ${analyzeResponse.status}`);
      }
      analyzerResults =
        (await analyzeResponse.json()) as PresidioAnalyzerResult[];
    } catch (err) {
      throw new Error(`Presidio analyzer unavailable: ${String(err)}`);
    }

    if (analyzerResults.length === 0) {
      return { maskedText: text, aliasMap: {} };
    }

    const filtered = analyzerResults.filter(
      (r) => !EXCLUDED_ENTITY_TYPES.has(r.entity_type),
    );

    if (filtered.length === 0) {
      return { maskedText: text, aliasMap: {} };
    }

    const deduplicated = deduplicateOverlapping(filtered);

    const counterLtr: Record<string, number> = {};
    const analysisWithPlaceholders = [...deduplicated]
      .sort((a, b) => a.start - b.start)
      .map((result) => {
        counterLtr[result.entity_type] =
          (counterLtr[result.entity_type] ?? 0) + 1;
        return {
          ...result,
          placeholder: `<${result.entity_type}_${counterLtr[result.entity_type]}>`,
        };
      });

    const aliasMap: Record<string, string> = {};
    for (const item of analysisWithPlaceholders) {
      aliasMap[item.placeholder] = text.slice(item.start, item.end);
    }

    // Replace right-to-left so earlier offsets stay valid after each substitution.
    let maskedText = text;
    for (const item of [...analysisWithPlaceholders].sort(
      (a, b) => b.start - a.start,
    )) {
      maskedText =
        maskedText.slice(0, item.start) +
        item.placeholder +
        maskedText.slice(item.end);
    }

    return { maskedText, aliasMap };
  }
}

const ENTITY_PRIORITY: Record<string, number> = {
  EMAIL_ADDRESS: 100,
  PL_IBAN: 90,
  IBAN_CODE: 90,
  CREDIT_CARD: 85,
  PL_PESEL: 80,
  PL_NIP: 75,
  PL_ID_CARD: 70,
  PL_PHONE: 60,
  PHONE_NUMBER: 55,
  PL_REGON: 50,
  PERSON: 40,
};

function entityPriority(entityType: string): number {
  return ENTITY_PRIORITY[entityType] ?? 0;
}

/**
 * Keep the highest-score result per overlapping span.
 * On score tie, prefer the more specific entity type via ENTITY_PRIORITY.
 */
function deduplicateOverlapping(
  results: PresidioAnalyzerResult[],
): PresidioAnalyzerResult[] {
  const sorted = [...results].sort(
    (a, b) =>
      b.score - a.score ||
      entityPriority(b.entity_type) - entityPriority(a.entity_type),
  );
  const kept: PresidioAnalyzerResult[] = [];
  for (const candidate of sorted) {
    const overlaps = kept.some(
      (k) => candidate.start < k.end && candidate.end > k.start,
    );
    if (!overlaps) {
      kept.push(candidate);
    }
  }
  return kept;
}

export const presidioClient = new PresidioClient();
