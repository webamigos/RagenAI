import { redirect } from '@/i18n/routing';
import { getLocale, getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { isAppAdmin } from '@/lib/auth-access-control';
import { CreateOrganizationForm } from './CreateOrganizationForm';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'admin.create-organization',
  });
  return { title: t('title') };
}

export default async function CreateOrganizationPage() {
  const [user, locale, t] = await Promise.all([
    getCurrentUser(),
    getLocale(),
    getTranslations('admin.create-organization'),
  ]);

  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  if (!isAppAdmin(user)) {
    return redirect({ href: '/', locale });
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-foreground">{t('title')}</h2>
      <div className="mt-4">
        <CreateOrganizationForm />
      </div>
    </div>
  );
}
