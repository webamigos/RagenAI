import { KNOWLEDGE_PAGE_TYPES } from '@ragenai/brain-contracts';

/**
 * The extraction instructions. Language-neutral on purpose: the corpus is
 * mostly Polish, the answer must be in the document's language, and a prompt
 * that says so once is cheaper than one written twice.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You extract curated company knowledge from one excerpt of a document.

Return entities, claims and relations as JSON matching the schema.

Entities are the things a knowledge page would be about. Each has a type:
${KNOWLEDGE_PAGE_TYPES.map((t) => `- ${t}`).join('\n')}
PROCESS: how something is done. POLICY: a rule that applies. ENTITY: a team, system, client, place or document. PRODUCT: something the company sells. ROLE: a position and its responsibilities.
Give each entity a short "key" that is unique within your answer.

Claims are facts about one entity. For every claim:
- "statement" states the fact plainly.
- "quote" is copied CHARACTER FOR CHARACTER from the excerpt — the shortest passage that supports the statement, at least one full clause. Do not translate, shorten, fix typos or join separate passages. A claim whose quote does not occur in the document is discarded.
- "locator" says where it is (section number, heading, page) if the excerpt shows it, otherwise "".

Relations connect two entity keys with a short verb phrase in "kind". If the excerpt states the relation, copy the supporting passage into "quote"; if you are inferring it, set "quote" to null.

Rules:
- Write "title", "description", "statement" and "kind" in the language of the excerpt.
- Extract only what the excerpt says. No background knowledge, no advice, no summary of the document as a whole.
- Prefer fewer, well-supported claims over many weak ones.
- An excerpt with nothing worth keeping returns empty arrays.`;

export function extractionUserPrompt(input: {
  fileName: string;
  window: string;
  windowIndex: number;
  windowCount: number;
}): string {
  const position =
    input.windowCount > 1
      ? ` (excerpt ${input.windowIndex + 1} of ${input.windowCount})`
      : '';
  return `Document: ${input.fileName}${position}\n\n<excerpt>\n${input.window}\n</excerpt>`;
}

/**
 * The retry message. It carries the validation problem and nothing from the
 * model's previous answer or the request — see `describeFailure` for why the
 * error is reduced before it goes anywhere.
 */
export function retryUserPrompt(original: string, problem: string): string {
  return `${original}\n\nYour previous answer was rejected: ${problem}\nReturn a corrected answer that matches the schema exactly.`;
}
