import { generateText } from 'ai';

import { getChatModelForOrg } from '../llm';
import { logger } from '../logger';
import { type UserFile } from '../db';
import { withLangfuseTrace } from '../langfuse-trace';

export async function parseSrtToSegmentsUsingLLM(
  organizationId: UserFile['organization_id'],
  fileContent: string,
  minWords: number,
  maxWords: number,
): Promise<string[]> {
  const modelId = 'gpt-5.4-nano';

  try {
    const model = await getChatModelForOrg(organizationId, modelId);
    const tags = ['srt-parsing', modelId];

    const { text } = await withLangfuseTrace(
      {
        name: 'parse-srt-segments',
        sessionId: organizationId,
        tags,
      },
      () =>
        generateText({
          model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: `Podziel dostarczony tekst na logiczne segmenty kontekstowe, które zawierają od ${minWords} do ${maxWords} słów.
    Każdy segment powinien być spójną całością, zawierającą dialogi lub wypowiedzi na jeden temat.`,
            },
            {
              role: 'user',
              content: `Podziel tekst:\n\n${fileContent}`,
            },
          ],
          experimental_telemetry: { isEnabled: true },
        }),
    );

    const segments = text
      .split('\n')
      .filter((segment: string) => segment.trim());

    return segments;
  } catch (error) {
    logger.error({ err: error }, 'Error while parsing SRT to segments');
    throw new Error('Failed to process the text. Please try again later.');
  }
}
