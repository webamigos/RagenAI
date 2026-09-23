import { getTranslations } from 'next-intl/server';

import { BRAIN_LIST_LIMIT } from '@/features/brain/constants';
import { Link } from '@/i18n/routing';

/**
 * Previous and next for a Brain list longer than one batch. Links, not
 * buttons: a batch is a URL, so it can be reloaded, shared and opened in a
 * new tab. Renders nothing when everything fits on one.
 */
export async function BrainPager({
  page,
  total,
  hrefFor,
}: {
  page: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.ceil(total / BRAIN_LIST_LIMIT);
  if (pages <= 1) {
    return null;
  }
  const t = await getTranslations('brain.pager');
  const linkClass = 'text-primary underline-offset-4 hover:underline';
  return (
    <nav
      aria-label={t('label')}
      className="mt-3 flex items-center gap-4 text-xs"
      data-testid="brain-pager"
    >
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={linkClass}>
          {t('previous')}
        </Link>
      ) : (
        <span className="text-muted-foreground">{t('previous')}</span>
      )}
      <span className="tabular-nums text-muted-foreground">
        {t('position', { page: Math.min(page, pages), pages })}
      </span>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className={linkClass}>
          {t('next')}
        </Link>
      ) : (
        <span className="text-muted-foreground">{t('next')}</span>
      )}
    </nav>
  );
}
