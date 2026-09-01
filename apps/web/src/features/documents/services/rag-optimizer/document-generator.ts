import { streamText } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';

const SYSTEM_PROMPT = `You are a RAG document optimizer. Your task is to reformat the provided document into a structured Q&A knowledge base format optimized for semantic retrieval with hybrid search (dense embeddings + BM25 sparse).

Rules:
1. Split content into Q&A sections. Each section starts with a heading: ### X.Y. Question?
   - Use ### level headings with numbering: 1.1, 1.2, 1.3... for the first topic area, 2.1, 2.2... for the second, etc.
   - Group sections under top-level # headings by topic area (e.g., # 1. Wynagrodzenia, # 2. Urlopy).
2. Each section must be fully self-contained: one question + one answer, 80–150 words total.
   - A reader must understand the answer without reading any other section.
   - Repeat key context: entity names, amounts, dates, legal references, contact info.
3. Preserve ALL specific entities from the source document:
   - Proper names (people, companies, products, brands)
   - Monetary amounts, percentages, dates, deadlines
   - Legal article numbers, regulation references
   - Phone numbers, email addresses, URLs
   - Time durations ("14 dni", "2 lata", "48 godzin")
4. Embed contact information (name, email, phone) in every section that references a responsible person or department.
5. Use the same language as the source document. If the language is ambiguous, use Polish.
6. Do NOT add a preamble, introduction, or closing summary. Start directly with the first # heading.
7. Do NOT invent information. Only restructure what is present in the source document.
8. Output valid Markdown.`;

const MAX_INPUT_CHARS = 100_000;

export function generateOptimizedDocument(
  content: string,
  model: LanguageModelV3,
) {
  if (content.length > MAX_INPUT_CHARS) {
    throw new Error(
      `Input exceeds maximum length of ${MAX_INPUT_CHARS} characters`,
    );
  }

  return streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Reformat the following document into a RAG-optimized Q&A knowledge base:\n\n${content}`,
      },
    ],
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'kb-document-generator',
    },
  });
}
