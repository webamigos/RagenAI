import type {
  BrainAssistantStoredMessage,
  BrainProposal,
} from '../contracts/brain-assistant.types';

/**
 * An assistant turn as it is kept: the answer and its proposals in one JSON
 * document, stored as the message's content — so both go through the thread's
 * encryption together (ADR-42) instead of the proposals sitting in the
 * plaintext `metadata` column beside an encrypted answer.
 */
export function encodeStoredMessage(
  text: string,
  proposals: BrainProposal[],
  options: { refused?: boolean } = {},
): string {
  const stored: BrainAssistantStoredMessage = {
    v: 1,
    text,
    proposals,
    ...(options.refused ? { refused: true } : {}),
  };
  return JSON.stringify(stored);
}

/**
 * The stored turn, or the content read as plain text when it is not one —
 * a message written by anything else is shown, never dropped.
 */
export function decodeStoredMessage(content: string): {
  text: string;
  proposals: BrainProposal[];
  refused: boolean;
} {
  if (content.startsWith('{')) {
    try {
      const parsed = JSON.parse(
        content,
      ) as Partial<BrainAssistantStoredMessage>;
      if (parsed.v === 1 && typeof parsed.text === 'string') {
        return {
          text: parsed.text,
          proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
          refused: parsed.refused === true,
        };
      }
    } catch {
      // Not ours; shown as text below.
    }
  }
  return { text: content, proposals: [], refused: false };
}

/** A conversation's title: the first question, cut to what a list row shows. */
export function threadTitle(question: string): string {
  const flat = question.replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}
