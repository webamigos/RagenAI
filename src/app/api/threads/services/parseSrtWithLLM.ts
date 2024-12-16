import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { createChatCompletionInstance } from '@/app/lib/services/llm';
import { logger } from '@/app/lib/utils/logger';
import { getOpenaiAPIKey } from '@/app/lib/services/settings';

export async function parseSrtToSegmentsUsingLLM(
  organizationId: string,
  fileContent: string,
  minWords: number,
  maxWords: number
): Promise<string[]> {
  const apiKey = await getOpenaiAPIKey(organizationId);

  if (!apiKey) {
    throw new Error('OpenAI API key is required.');
  }

  const chat = createChatCompletionInstance({
    model: 'gpt-4o-mini',
    temperature: 0,
    apiKey,
  });

  const systemMessage = new SystemMessage(
    `Podziel dostarczony tekst na logiczne segmenty kontekstowe, które zawierają od ${minWords} do ${maxWords} słów.
    Każdy segment powinien być spójną całością, zawierającą dialogi lub wypowiedzi na jeden temat.`
  );

  const humanMessage = new HumanMessage(`Podziel tekst:\n\n${fileContent}`);

  try {
    const response = await chat.invoke([systemMessage, humanMessage]);
    const segments = response.text
      .split('\n')
      .filter((segment: string) => segment.trim());

    return segments;
  } catch (error) {
    logger.error('Error while parsing SRT to segments using LLM:', error);
    throw new Error('Failed to process the text. Please try again later.');
  }
}
