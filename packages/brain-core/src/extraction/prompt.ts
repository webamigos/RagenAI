import { KNOWLEDGE_PAGE_TYPES } from '@ragenai/brain-contracts';

/**
 * The extraction instructions.
 *
 * The language is named in the user message rather than left to "the
 * language of the excerpt": told only that, gemini-2.5-flash wrote Polish
 * statements under English descriptions (B5's first run). The worker knows
 * each document's language — ingest detects it into `UserFile.language` — so
 * it says so.
 *
 * Relations are asked for by kind, with examples. Offered only as an optional
 * third array, the model returned none for a document full of them.
 *
 * One claim per quoted passage: asked for whole sentences, the model split a
 * price table into a claim per cell — 14,600 output tokens for a 3,400-
 * character document, truncated at the cap, and every claim after the first
 * per row dropped anyway as a duplicate of its quote.
 *
 * A table is one entity: told only that, the model made every row its own
 * page — 39 candidates from one price list, each with one claim and an
 * inferred "belongs to" edge, which is a curation queue nobody works through.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You extract curated company knowledge from one excerpt of a document.

Return entities, claims and relations as JSON matching the schema.

LANGUAGE: write every "title", "description", "statement" and "kind" in the language the user message names. Never switch to English for a document that is not in English. Quotes are never translated.

ENTITIES are the things a knowledge page would be about. Each has a type:
${KNOWLEDGE_PAGE_TYPES.map((t) => `- ${t}`).join('\n')}
PROCESS: how something is done. POLICY: a rule that applies. ENTITY: a team, system, client, place or document. PRODUCT: something the company sells. ROLE: a position and its responsibilities.
Give each entity a short "key" that is unique within your answer, and a one- or two-sentence "description".
A TABLE is one entity — the list it is (a price list, a table of limits, a schedule) — and its rows are claims about that entity. Do not make each row an entity of its own unless the excerpt also describes that row's subject in prose.

CLAIMS are facts about one entity. For every claim:
- "statement" states the fact plainly.
- "quote" is copied CHARACTER FOR CHARACTER from the excerpt: the whole sentence (or list item, or table row) that supports the statement. Do not translate, shorten, fix typos or join separate passages. A claim whose quote does not occur in the document is discarded.
- "locator" says where it is (section number, heading, page) if the excerpt shows it, otherwise "".
- Use each quote once. When one sentence, list item or table row states several facts, give ONE claim whose statement says all of them — for a table, one claim per row, never one per cell.

RELATIONS connect two entity keys. Whenever the excerpt links two of your entities, add a relation — who approves, owns or is responsible for something; what a rule applies to; what a product includes or costs; what a process requires, precedes or produces; which document governs what. "kind" is a short verb phrase ("approves", "applies to", "is part of", "requires"). If the excerpt states the link, copy the sentence into "quote"; if you are inferring it, set "quote" to null. A document that names several entities almost always relates them.

Rules:
- Extract only what the excerpt says. No background knowledge, no advice, no summary of the document as a whole.
- Prefer fewer, well-supported claims over many weak ones.
- An excerpt with nothing worth keeping returns empty arrays.`;

/** ISO 639-3, as `franc` writes `UserFile.language`, to a name a model reads. */
const LANGUAGE_NAMES: Record<string, string> = {
  pol: 'Polish',
  eng: 'English',
  deu: 'German',
  ces: 'Czech',
  slk: 'Slovak',
  ukr: 'Ukrainian',
  fra: 'French',
  spa: 'Spanish',
  ita: 'Italian',
  nld: 'Dutch',
};

export function languageName(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }
  return LANGUAGE_NAMES[code.toLowerCase()] ?? null;
}

export function extractionUserPrompt(input: {
  fileName: string;
  window: string;
  windowIndex: number;
  windowCount: number;
  language?: string | null;
}): string {
  const position =
    input.windowCount > 1
      ? ` (excerpt ${input.windowIndex + 1} of ${input.windowCount})`
      : '';
  const name = languageName(input.language);
  const language = name
    ? `Language: ${name}. Write every title, description, statement and kind in ${name}.`
    : 'Language: the language of the excerpt. Write every title, description, statement and kind in it.';
  return `Document: ${input.fileName}${position}\n${language}\n\n<excerpt>\n${input.window}\n</excerpt>`;
}

/**
 * The retry message. It carries the validation problem and nothing from the
 * model's previous answer or the request — see `describeFailure` for why the
 * error is reduced before it goes anywhere.
 */
export function retryUserPrompt(original: string, problem: string): string {
  return `${original}\n\nYour previous answer was rejected: ${problem}\nReturn a corrected answer that matches the schema exactly.`;
}
