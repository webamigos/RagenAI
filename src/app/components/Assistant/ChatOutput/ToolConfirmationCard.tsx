'use client';

import { ShieldExclamationIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { type PendingToolApproval } from '@/store/tool-approvals/toolApprovalsSlice';

/**
 * Inline card rendered at the tail of a paused assistant message when
 * the AI SDK's `needsApproval` predicate blocks a write tool call
 * (Phase 2 prompt-injection gating).
 *
 * Shows the tool name + provider badge and two buttons:
 *   - Approve → parent dispatches a new chat turn with
 *     `approvedToolCalls: [toolCallId]`
 *   - Deny → parent dispatches a new chat turn with a "no, cancel"
 *     prompt and records a `TOOL_CALL_DENIED` security event
 *
 * The card is deliberately minimal for Phase 2b-1: just buttons +
 * metadata, no tool-argument preview, no modal chrome. The chat
 * explanation delta already described what the tool would have done,
 * so the card is a trust affordance, not an information display.
 */
type Props = {
  approval: PendingToolApproval;
  onApprove: (approval: PendingToolApproval) => void;
  onDeny: (approval: PendingToolApproval) => void;
  disabled?: boolean;
};

/**
 * Turn the prefixed tool name into a human-friendly label. The server
 * sends the provider-prefixed form (`google_calendar__gcal_create_event`);
 * we strip the prefix and replace underscores with spaces. Kept
 * all-lowercase because the card renders this in `font-mono`, where
 * lowercase reads cleaner than title-casing would.
 * Example: `google_calendar__gcal_create_event` → `gcal create event`.
 */
function humanizeToolName(toolName: string): string {
  const local = toolName.includes('__')
    ? toolName.slice(toolName.indexOf('__') + 2)
    : toolName;
  return local.replace(/_/g, ' ');
}

function humanizeProvider(provider: string): string {
  return provider
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function ToolConfirmationCard({
  approval,
  onApprove,
  onDeny,
  disabled = false,
}: Props) {
  const t = useTranslations('tool-confirmation');

  const handleApprove = () => {
    if (disabled) {
      return;
    }
    onApprove(approval);
  };

  const handleDeny = () => {
    if (disabled) {
      return;
    }
    onDeny(approval);
  };

  return (
    <div
      role="region"
      aria-label={t('aria-label')}
      className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-900/10"
      data-testid="tool-confirmation-card"
    >
      <div className="flex items-start gap-3">
        <ShieldExclamationIcon
          className="size-5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {t('title')}
          </p>
          <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300/90">
            {t('description')}
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-900/90 dark:text-amber-200/90">
            <div>
              <dt className="inline font-medium">{t('tool-label')}: </dt>
              <dd className="inline font-mono">
                {humanizeToolName(approval.toolName)}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">{t('provider-label')}: </dt>
              <dd className="inline">{humanizeProvider(approval.provider)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleDeny}
          disabled={disabled}
          data-testid="tool-confirmation-deny"
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-900/20"
        >
          {t('deny')}
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={disabled}
          data-testid="tool-confirmation-approve"
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-400"
        >
          {t('approve')}
        </button>
      </div>
    </div>
  );
}
