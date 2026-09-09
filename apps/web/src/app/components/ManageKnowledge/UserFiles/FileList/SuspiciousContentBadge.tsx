'use client';

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';

/**
 * Phase 4 — warning badge rendered next to a KB file's name when its
 * `metadata.suspicious === true`. The ingest sanitizer flags files
 * whose content matches prompt-injection patterns (zero-width chars,
 * "ignore previous instructions", forged `<system>` tags, etc.) so
 * admins can review them before relying on them in RAG queries.
 *
 * The badge is non-destructive — the file is still searchable and
 * usable. It's an advisory signal, not a block.
 */
export function SuspiciousContentBadge({ metadata }: { metadata?: unknown }) {
  const t = useTranslations('kb-suspicious-badge');

  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const meta = metadata as { suspicious?: unknown };
  if (meta.suspicious !== true) {
    return null;
  }

  return (
    <span
      title={t('tooltip')}
      aria-label={t('aria-label')}
      data-testid="kb-suspicious-badge"
      className="ml-1.5 inline-flex size-4 items-center justify-center text-pending"
    >
      <ExclamationTriangleIcon className="size-4" />
    </span>
  );
}
