import { generateText } from 'ai';

import { createChatCompletionInstance } from '@/app/lib/services/llm';
import { logger } from '@/app/lib/utils/logger';
import { getOpenaiAPIKey } from '@/features/organizations/services/organization-settings';

export async function parseSrtToSegmentsUsingLLM(
  organizationId: string,
  fileContent: string,
  minWords: number,
  maxWords: number,
): Promise<string[]> {
  const apiKey = await getOpenaiAPIKey(organizationId);

  if (!apiKey) {
    throw new Error('OpenAI API key is required.');
  }

  const chat = createChatCompletionInstance({
    // Not gpt-4o-mini: infra/litellm/config.yaml does not provision it, so
    // every call on this path returned a model error.
    model: process.env.SUMMARY_MODEL || 'gemini-3-flash-preview',
    temperature: 0,
    apiKey,
  });

  try {
    const result = await generateText({
      model: chat,
      system: `Podziel dostarczony tekst na logiczne segmenty kontekstowe, ktore zawieraja od ${minWords} do ${maxWords} slow.
    Kazdy segment powinien byc spojna caloscia, zawierajaca dialogi lub wypowiedzi na jeden temat.`,
      messages: [
        {
          role: 'user',
          content: `Podziel tekst:\n\n${fileContent}`,
        },
      ],
      experimental_telemetry: { isEnabled: true },
    });

    const segments = result.text
      .split('\n')
      .filter((segment: string) => segment.trim());

    return segments;
  } catch (error) {
    logger.error({ err: error }, 'Error while parsing SRT to segments');
    throw new Error('Failed to process the text. Please try again later.');
  }
}
