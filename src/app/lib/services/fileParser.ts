import { parseSrtToSegmentsUsingLLM } from '@/app/api/threads/services/parseSrtWithLLM';
import OpenAI from 'openai';
import { readFile } from 'fs/promises';
import { logger } from '@/app/lib/utils/logger';

import { getFileType } from '../utils/getFileType';

export type ParsedFile = {
  content: string | Buffer;
  fileName: string;
  fileType: SupportedFileType;
};
const openai = new OpenAI();

export type SupportedFileType = 'srt' | 'pdf' | 'epub' | 'text';

type FileParser = (
  file: File,
  organizationId?: string
) => Promise<string | Buffer>;

const fileParsers: Record<SupportedFileType, FileParser> = {
  srt: async (file, organizationId) => {
    if (!organizationId) {
      throw new Error('Organization ID is required for .srt files');
    }
    const fileText = await file.text();
    const segments = await parseSrtToSegmentsUsingLLM(
      organizationId,
      fileText,
      200,
      300
    );
    return segments.join('\n\n');
  },
  pdf: async (file) => Buffer.from(await file.arrayBuffer()),
  epub: async (file) => Buffer.from(await file.arrayBuffer()),
  text: async (file) => file.text(),
};

export async function parseFile(
  file: File,
  organizationId?: string
): Promise<ParsedFile> {
  if (file.size === 0) {
    throw new Error(`The file ${file.name} is empty`);
  }

  const fileType = getFileType(file.name);

  if (!fileParsers[fileType]) {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  const content = await fileParsers[fileType](file, organizationId);
  return { content, fileName: file.name, fileType };
}

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
export { getFileType };
