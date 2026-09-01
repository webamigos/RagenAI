import { generateText } from 'ai';
import { getChatModelForOrg } from '../../services/llm/provider';
import { withLangfuseTrace } from '../../services/langfuse-trace';
import type {
  GenerateDocumentContentParams,
  DocumentSection,
} from './docgen-types';

function isValidDocumentSection(item: unknown): item is DocumentSection {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as DocumentSection).title === 'string' &&
    typeof (item as DocumentSection).content === 'string' &&
    typeof (item as DocumentSection).level === 'number' &&
    (item as DocumentSection).level >= 1 &&
    (item as DocumentSection).level <= 6
  );
}

const SYSTEM_PROMPT = `You are a professional document writer. Your task is to generate a structured workshop summary document from the provided workshop notes or transcript.

Generate the document as a JSON array of sections. Each section has:
- "title": The section heading text
- "content": The section body text (use plain text, separate paragraphs with double newlines)
- "level": Heading level (1 for main title, 2 for major sections, 3 for subsections)

The document should include the following sections in order:
1. Title (level 1): "Workshop Summary — {clientName}"
2. Executive Summary (level 2): A concise overview of the workshop, its purpose, and key outcomes
3. Key Discussion Points (level 2): The main topics discussed, with subsections (level 3) for each major topic
4. Decisions Made (level 2): Clear list of decisions reached during the workshop
5. Action Items (level 2): Specific tasks, owners (if mentioned), and deadlines (if mentioned)
6. Next Steps (level 2): Follow-up actions and timeline

IMPORTANT:
- Respond ONLY with a valid JSON array, no markdown code fences or other text
- Extract real content from the notes — do not invent information
- If certain sections have no relevant content from the notes, include a brief note stating that
- Keep the language professional and clear`;

export async function generateDocumentContent(
  params: GenerateDocumentContentParams,
): Promise<DocumentSection[]> {
  const model = await getChatModelForOrg(
    params.orgId,
    // gemini-3-flash-preview, matching defaultOrganizationSettings and
    // infra/litellm/config.yaml. The previous fallback was gpt-4o, which
    // that config has not provisioned for some time.
    process.env.DEFAULT_MODEL || 'gemini-3-flash-preview',
  );

  const notesContent =
    typeof params.rawInput.content === 'string'
      ? params.rawInput.content
      : JSON.stringify(params.rawInput);

  const prompt = `Client: ${params.clientName}\n\nWorkshop Notes:\n${notesContent}`;

  const result = await withLangfuseTrace(
    { name: 'generate-document-content', tags: ['docgen'] },
    () => generateText({ model, system: SYSTEM_PROMPT, prompt }),
  );

  const parsed = JSON.parse(result.text) as DocumentSection[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('LLM returned invalid document structure');
  }

  for (const item of parsed) {
    if (!isValidDocumentSection(item)) {
      throw new Error('LLM returned invalid document structure');
    }
  }

  return parsed;
}
