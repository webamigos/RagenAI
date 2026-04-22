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

    // Assign placeholder numbers left-to-right so numbering is deterministic
    const counterLtr: Record<string, number> = {};
    const analysisWithPlaceholders = [...analyzerResults]
      .sort((a, b) => a.start - b.start)
      .map((result) => {
        counterLtr[result.entity_type] =
          (counterLtr[result.entity_type] ?? 0) + 1;
        return {
          ...result,
          placeholder: `<${result.entity_type}_${counterLtr[result.entity_type]}>`,
        };
      });

    // Build aliasMap: placeholder → original value from text
    const aliasMap: Record<string, string> = {};
    for (const item of analysisWithPlaceholders) {
      aliasMap[item.placeholder] = text.slice(item.start, item.end);
    }

    // Build maskedText by replacing right-to-left so offsets stay valid
    let maskedText = text;
    const sortedDesc = [...analysisWithPlaceholders].sort(
      (a, b) => b.start - a.start,
    );
    for (const item of sortedDesc) {
      maskedText =
        maskedText.slice(0, item.start) +
        item.placeholder +
        maskedText.slice(item.end);
    }

    return { maskedText, aliasMap };
  }
}

export const presidioClient = new PresidioClient();
