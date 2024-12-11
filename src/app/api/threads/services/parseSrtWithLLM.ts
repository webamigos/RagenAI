import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

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
