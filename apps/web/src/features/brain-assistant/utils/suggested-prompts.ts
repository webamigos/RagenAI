import type { BrainScreenView } from '../contracts/brain-assistant.types';

/**
 * The empty panel's prompts, chosen for the screen (spec "Panel") — message
 * keys under `brain.assistant.prompts`. The first ones are the questions a
 * person on that screen asks most; read-only visitors get the ones that do
 * not lead to a change.
 */
const PROMPTS: Record<BrainScreenView, { key: string; writes?: boolean }[]> = {
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
    { key: 'depends-selected' },
    { key: 'isolated' },
    { key: 'duplicates' },
  ],
  documents: [{ key: 'why-failed' }, { key: 'uncurated' }],
};

export function suggestedPromptKeys(
  view: BrainScreenView,
  canWrite: boolean,
): string[] {
  return PROMPTS[view].filter((p) => canWrite || !p.writes).map((p) => p.key);
}
