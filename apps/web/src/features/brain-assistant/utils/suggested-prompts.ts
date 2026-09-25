import type { BrainScreenView } from '../contracts/brain-assistant.types';

/**
 * The empty panel's prompts, chosen for the screen (spec "Panel") — message
 * keys under `brain.assistant.prompts`. The first ones are the questions a
 * person on that screen asks most; read-only visitors get the ones that do
 * not lead to a change.
 */
type Prompt = {
  key: string;
  /** Leads to a change: not offered to a read-only visitor. */
  writes?: boolean;
  /** Asks about the page picked on the screen: not offered until one is. */
  aboutSelection?: boolean;
};

const PROMPTS: Record<BrainScreenView, Prompt[]> = {
  pages: [{ key: 'what-first' }, { key: 'duplicates' }, { key: 'week' }],
  inbox: [
    { key: 'what-first' },
    { key: 'contradictions' },
    { key: 'failed' },
    { key: 'week' },
  ],
  finding: [
    { key: 'disagree' },
    { key: 'what-to-do', writes: true },
    { key: 'why-failed' },
  ],
  page: [
    { key: 'is-right' },
    { key: 'owner', writes: true },
    { key: 'why-stale' },
    { key: 'depends' },
    { key: 'expose' },
  ],
  graph: [
    { key: 'depends-selected', aboutSelection: true },
    { key: 'isolated' },
    { key: 'duplicates' },
  ],
  documents: [{ key: 'why-failed' }, { key: 'uncurated' }],
};

/**
 * `hasSelection`: a page is picked on the screen. "What depends on the
 * selected page?" with nothing selected was offered on every graph that
 * opened, and answered about nothing.
 */
export function suggestedPromptKeys(
  view: BrainScreenView,
  canWrite: boolean,
  hasSelection = false,
): string[] {
  return PROMPTS[view]
    .filter((p) => canWrite || !p.writes)
    .filter((p) => hasSelection || !p.aboutSelection)
    .map((p) => p.key);
}
