import { generateObject } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import {
  ragScoreSchema,
  type RagScore,
} from '@/features/documents/contracts/rag-score.types';
import { logger } from '@/app/lib/utils/logger';

const MAX_CONTENT_LENGTH = 12_000;

const SYSTEM_PROMPT = `You are a RAG quality evaluator. Analyze the provided document for retrieval-augmented generation readiness.

Score each dimension from 0 to 10:

- chunkStructure (0–10): Presence of numbered headings (### 1.1, ### 1.2, etc.) that create natural chunk boundaries for text splitters. 0 = no headings at all, 10 = consistent numbered Q&A headings throughout.

- avgChunkSize (0–10): Whether content sections are 80–150 words each (ideal for embedding models like Cohere embed-multilingual-v3). 0 = single massive block or extremely short fragments, 10 = all sections in the 80–150 word range.

- entityDensity (0–10): Density of specific, searchable entities: proper names, monetary amounts, dates, legal article numbers, phone numbers, email addresses, time durations. These are critical signals for BM25/sparse retrieval. 0 = no specific entities, 10 = rich entities embedded throughout.

- selfContainedness (0–10): Whether each section is understandable without reading other sections. Each chunk should repeat enough context (names, references, amounts) that it makes sense in isolation. 0 = sections are fragments that require reading the whole document, 10 = every section stands alone.

- qaAdherence (0–10): Whether sections follow a question + answer structure with clear question headings. 0 = prose/narrative with no questions, 10 = consistent Q&A format throughout.

total (0–100): Weighted overall score. Calculate as: chunkStructure × 2.5 + avgChunkSize × 1.5 + entityDensity × 2 + selfContainedness × 2.5 + qaAdherence × 1.5

suggestions: Up to 5 concrete, actionable improvement suggestions. Be specific about what to change, not vague. Reference specific parts of the document when possible.`;

export async function scoreDocument(
  content: string,
  model: LanguageModelV3,
): Promise<RagScore> {
  const truncated =
    content.length > MAX_CONTENT_LENGTH
      ? content.slice(0, MAX_CONTENT_LENGTH)
      : content;

  try {
    const result = await generateObject({
      model,
      schema: ragScoreSchema,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Evaluate the following document for RAG readiness:\n\n${truncated}`,
        },
      ],
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'kb-document-scorer',
      },
    });

    return result.object;
  } catch (err) {
    logger.error({ err }, 'Document scoring failed');
    throw err;
  }
}
