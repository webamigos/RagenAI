import {
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';
import { VECTOR_STORE_TABLE_NAME } from '@/libs/db/constants/vectorStore';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

export async function deleteDocument(file_id: string) {
  try {
    setSentryServiceTag('deleteDocument');
    setSentryContext('EXTRA_DATA', {
      file_id,
    });
    await supabaseVectorStoreClient
      .from(VECTOR_STORE_TABLE_NAME)
      .delete()
      .eq('metadata->>file_id', file_id);
  } catch (error) {
    logger.error({ err: error }, 'Error in deleteDocument function');
    throw error;
  }
}

export async function parseSrtToSegmentsUsingLLM(
  fileContent: string,
  minWords: number,
  maxWords: number
): Promise<string[]> {
  const chat = new ChatOpenAI({
    temperature: 0,
    modelName: 'gpt-4o-mini',
  });

  const systemMessage = new SystemMessage(
    `Podziel dostarczony tekst na logiczne segmenty kontekstowe, które zawierają od  ${minWords} do ${maxWords} słów.
    Każdy segment powinien być spójną całością, zawierającą dialogi lub wypowiedzi na jeden temat.`
  );

  const humanMessage = new HumanMessage(`Podziel tekst:\n\n${fileContent}`);

  const response = await chat.invoke([systemMessage, humanMessage]);
  const segments = response.text
    .split('\n')
    .filter((segment: string) => segment.trim());

  return segments;
}
