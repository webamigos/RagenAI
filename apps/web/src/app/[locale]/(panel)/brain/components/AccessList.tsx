import { getTranslations } from 'next-intl/server';

import type { AccessEntry } from '@/features/brain/contracts/brain.types';

/**
 * Who the page is open to, exactly as `accessibleBy` says — rule 22 of
 * `docs/panel-ux-rules.md`: never a label wider or narrower than what
 * retrieval will enforce once the page is published.
 */
export async function AccessList({ entries }: { entries: AccessEntry[] }) {
  const t = await getTranslations('brain.page.access');
  if (entries.length === 0) {
    return <p className="text-sm text-foreground">{t('nobody')}</p>;
  }
  return (
    <ul className="space-y-0.5 text-sm text-foreground">
      {entries.map((entry, i) => (
        <li key={i}>
          {entry.kind === 'organization' && t('organization')}
          {entry.kind === 'user' &&
            (entry.name ? t('user', { name: entry.name }) : t('user-gone'))}
          {entry.kind === 'team' &&
            (entry.name ? t('team', { name: entry.name }) : t('team-gone'))}
          {entry.kind === 'unmatched' && t('unmatched')}
        </li>
      ))}
    </ul>
  );
}
