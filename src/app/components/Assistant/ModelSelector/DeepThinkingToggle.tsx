'use client';

import { useTranslations } from 'next-intl';
import { BrainIcon } from '@/libs/common-ui/icons/BrainIcon';
import {
  DEEP_THINKING_DEFAULT_MODEL,
  supportsReasoningEffort,
} from '../../config';

type Props = {
  /** Current model selection (thread or org default). */
  model: string | null;
  /** Whether deep thinking is currently on for this thread. */
  enabled: boolean;
  /** Whether attachments are present — GPT-OSS is text-only, so we disable. */
  hasAttachments: boolean;
  /**
   * Toggle handler. The parent is responsible for switching the active
   * model: enable → `DEEP_THINKING_DEFAULT_MODEL`, disable → org default.
   */
  onToggle: (next: boolean) => void;
};

/**
 * "Deep thinking" toggle rendered next to the thread model label.
 *
 * Renders only when the active model declares `supportsReasoningEffort`
 * (currently GPT-OSS via Scaleway). Setting the toggle on while a
 * non-supporting model is selected is impossible by design — we only
 * mount this control when the active model already supports it. The
 * parent can also call `onToggle` after auto-switching the model.
 *
 * Disabled when the user has attached files: GPT-OSS does not accept
 * multimodal content and the multimodal fallback (`mistral-small-3.2`)
 * does not understand `reasoning_effort`.
 */
export const DeepThinkingToggle = ({
  model: _model,
  enabled,
  hasAttachments,
  onToggle,
}: Props) => {
  const t = useTranslations('assistant.deep-thinking');

  // Always render so the user can opt-in even if their current model is not
  // a reasoning model — the parent will switch the model on enable.
  const disabled = hasAttachments;

  const handleClick = () => {
    if (disabled) {
      return;
    }
    onToggle(!enabled);
  };

  let title: string;
  if (disabled) {
    title = t('disabled-attachments');
  } else if (enabled) {
    title = t('on-tooltip', { model: DEEP_THINKING_DEFAULT_MODEL });
  } else {
    title = t('off-tooltip');
  }

  let stateClasses: string;
  let iconClasses: string;
  if (disabled) {
    stateClasses =
      'border-border/40 text-muted-foreground/50 cursor-not-allowed';
    iconClasses = 'size-4 text-muted-foreground/50';
  } else if (enabled) {
    // "Brain color" — use the Ragen blue accent so the icon visibly lights up
    // when the toggle is on, mirroring how reasoning models are flagged
    // elsewhere (BrainIcon next to model names).
    stateClasses =
      'border-ragen-blue/40 bg-ragen-blue/10 text-ragen-blue hover:bg-ragen-blue/15';
    iconClasses = 'size-4 text-ragen-blue';
  } else {
    stateClasses =
      'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50';
    iconClasses = 'size-4 text-muted-foreground';
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      data-testid="deep-thinking-toggle"
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-colors duration-150 ${stateClasses}`}
      aria-pressed={enabled}
      aria-label={t('aria-label')}
    >
      <BrainIcon className={iconClasses} />
      <span>{t('label')}</span>
    </button>
  );
};
