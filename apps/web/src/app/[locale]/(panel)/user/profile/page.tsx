import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { redirect } from 'next/navigation';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { ProfileEditForm } from './components/ProfileEditForm';
import { PasswordChangeForm } from './components/PasswordChangeForm';
import { isSharedDemoAccount } from '@/libs/demo-credentials';

type Props = {
  params: Promise<{
    locale: string;
    rest: string[];
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale, rest } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const subPath = rest?.[0];
  return {
    title: subPath ? t(`my-profile:${subPath}.title`) : t('my-profile.title'),
  };
}

export default async function MyProfilePage({ params }: Props) {
  const user = await getCurrentUser();
  const { locale } = await params;

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  const t = await getTranslations({ locale, namespace: 'user-profile' });
  const locked = isSharedDemoAccount(user.email);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-foreground">{t('title')}</h1>

      <TabGroup>
        <TabList className="flex space-x-1 rounded-xl bg-muted p-1">
          <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-foreground ring-white/60 ring-offset-2 ring-offset-brand-400 focus:outline-none focus:ring-2 data-[selected]:bg-white data-[selected]:text-brand-700 data-[selected]:shadow dark:data-[selected]:bg-paper-700 dark:data-[selected]:text-brand-400">
            {t('tabs.profile')}
          </Tab>
          <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-foreground ring-white/60 ring-offset-2 ring-offset-brand-400 focus:outline-none focus:ring-2 data-[selected]:bg-white data-[selected]:text-brand-700 data-[selected]:shadow dark:data-[selected]:bg-paper-700 dark:data-[selected]:text-brand-400">
            {t('tabs.security')}
          </Tab>
        </TabList>

        <TabPanels className="mt-6">
          {/* Profile Tab */}
          <TabPanel className="rounded-xl bg-white p-6 shadow dark:bg-card">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">
                {t('profile.title')}
              </h3>
              <ProfileEditForm user={user} locked={locked} />
            </div>
          </TabPanel>

          {/* Security Tab */}
          <TabPanel className="rounded-xl bg-white p-6 shadow dark:bg-card">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">
                {t('tabs.security')}
              </h3>
              <PasswordChangeForm locked={locked} />
            </div>
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
}
