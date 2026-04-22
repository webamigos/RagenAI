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

interface PresidioAnonymizerItem {
  operator: string;
  entity_type: string;
  text: string;
  start: number;
  end: number;
}

interface PresidioAnonymizerResult {
  text: string;
  items: PresidioAnonymizerItem[];
}

class PresidioClient {
  private analyzerUrl: string;
  private anonymizerUrl: string;

  constructor() {
    this.analyzerUrl =
      process.env.PRESIDIO_ANALYZER_URL ?? 'http://localhost:5002';
    this.anonymizerUrl =
      process.env.PRESIDIO_ANONYMIZER_URL ?? 'http://localhost:5003';
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

    const entityCounters: Record<string, number> = {};
    const anonymizerConfig: Record<
      string,
      { type: string; new_value: string }
    > = {};

    for (const result of analyzerResults) {
      entityCounters[result.entity_type] =
        (entityCounters[result.entity_type] ?? 0) + 1;
      const placeholder = `<${result.entity_type}_${entityCounters[result.entity_type]}>`;
      anonymizerConfig[result.entity_type] = {
        type: 'replace',
        new_value: placeholder,
      };
    }

    let anonymizerResult: PresidioAnonymizerResult;
    try {
      const anonymizeResponse = await fetch(`${this.anonymizerUrl}/anonymize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          analyzer_results: analyzerResults,
          anonymizers: anonymizerConfig,
        }),
      });
      if (!anonymizeResponse.ok) {
        throw new Error(`status ${anonymizeResponse.status}`);
      }
      anonymizerResult =
        (await anonymizeResponse.json()) as PresidioAnonymizerResult;
    } catch (err) {
      throw new Error(`Presidio anonymizer unavailable: ${String(err)}`);
    }

    const aliasMap: Record<string, string> = {};
    for (const item of anonymizerResult.items) {
      const originalValue = text.slice(item.start, item.end);
      aliasMap[item.text] = originalValue;
    }

    return { maskedText: anonymizerResult.text, aliasMap };
  }
}

export const presidioClient = new PresidioClient();
