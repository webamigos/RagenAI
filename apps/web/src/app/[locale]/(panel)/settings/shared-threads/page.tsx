import { getTranslations } from 'next-intl/server';
import { getCurrentUserId } from '@/app/lib/utils/auth-helpers';
import { getUserPublicLinksQuery } from '@/features/threads/services/queries/get-user-public-links-query';
import { SharedThreadsList } from './SharedThreadsList';

export async function generateMetadata() {
  const t = await getTranslations('settings-page.shared-threads');
  return { title: t('title') };
}

export default async function SharedThreadsPage() {
  const t = await getTranslations('settings-page.shared-threads');
  const userId = await getCurrentUserId();
  const links = userId ? await getUserPublicLinksQuery(userId) : [];

  return (
    <div className="max-w-2xl space-y-4">
      <section>
        <h2 className="text-base font-semibold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </section>
      <SharedThreadsList initialLinks={links} />
    </div>
  );
}
