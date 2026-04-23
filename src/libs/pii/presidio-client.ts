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

class PresidioClient {
  private analyzerUrl: string;

  constructor() {
    this.analyzerUrl =
      process.env.PRESIDIO_ANALYZER_URL ?? 'http://localhost:5002';
  }

  async anonymize(text: string, language: string): Promise<AnonymizeResult> {
    // Step 1: Analyze — detect PII entities
    let analyzerResults: PresidioAnalyzerResult[];
    try {
      const analyzeResponse = await fetch(`${this.analyzerUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language }),
      });
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

    // Remove overlapping spans — keep only the highest-score result per span.
    // Checksum validation is handled by Python recognizers in Presidio.
    const deduplicated = deduplicateOverlapping(analyzerResults);

    // Build aliasMap (placeholder → original) and assign placeholders.
    // Assign placeholder numbers left-to-right so numbering is deterministic.
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

    // Replace spans right-to-left so earlier offsets stay valid after each substitution.
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

// Keep highest-score result when multiple results overlap the same span.
// On score tie, prefer the entity type that is more specific/likely.
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
