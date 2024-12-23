import {
  ChatOpenAI,
  ChatOpenAIFields,
  OpenAIEmbeddings,
} from '@langchain/openai';
import OpenAI from 'openai';
import { OpenAIModerationChain } from 'langchain/chains';
import { OpenAIModerationChainInput } from 'langchain/dist/chains/openai_moderation';
import { readFile } from 'fs/promises';
import { logger } from '@/app/lib/utils/logger';

const openai = new OpenAI();

const verbose = process.env.NODE_ENV === 'development';

export const createChatCompletionInstance = (options: ChatOpenAIFields) => {
  if (!options.apiKey) {
    throw new Error('Cannot create chat instance, apiKey is required');
  }

  return new ChatOpenAI({
    ...options,
    verbose,
    streaming: true,
  });
};

export const createModerationInstance = (
  options: OpenAIModerationChainInput
) => {
  if (!options.apiKey) {
    throw new Error('Cannot create moderation instance, apiKey is required');
  }

  return new OpenAIModerationChain({ ...options, verbose });
};

export const createEmbeddingsInstance = ({ apiKey }: { apiKey: string }) => {
  if (!apiKey) {
    throw new Error('Cannot create embeddings instance, apiKey is required');
  }

  return new OpenAIEmbeddings({
    apiKey,
    model: 'text-embedding-3-small',
  });
};

export async function describeImageWithLLM(imagePath: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Jesteś ekspertem w analizowaniu plików PDF. Proszę:
- Wyodrębnij i przepisz cały widoczny tekst, zachowując jego oryginalną strukturę
- Opisz szczegółowo wszelkie diagramy, ilustracje, wykresy lub inne elementy graficzne
- Zidentyfikuj i wyjaśnij wszelkie:
    - Równania lub formuły matematyczne
    - Schematy blokowe lub mapy myśli
    - Tabele lub dane w formie tabelarycznej
    - Strzałki lub linie łączące poszczególne elementy
- Zwróć uwagę na elementy wyróżniające (podkreślenia, zakreślenia, obwiedzenia)
- Opisz układ przestrzenny i organizację treści
- Wskaż wszelkie symbole, adnotacje lub specjalne oznaczenia
Proszę zorganizować odpowiedź w wyraźnie oddzielonych sekcjach. Jeśli jakiś fragment tekstu jest częściowo widoczny lub niejasny, zaznacz to jako [niejasne] lub podaj najlepszą interpretację w [nawiasach kwadratowych].`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${await readFile(
                  imagePath,
                  'base64'
                )}`,
              },
            },
          ],
        },
      ],
    });

    return response.choices[0]?.message?.content || 'No description generated.';
  } catch (error) {
    logger.error({ err: error }, 'Error describing image with LLM');
    return `Error describing image: ${error}`;
  }
}
