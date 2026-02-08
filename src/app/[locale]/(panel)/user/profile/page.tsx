import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { redirect } from 'next/navigation';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { ProfileEditForm } from './components/ProfileEditForm';
import { PasswordChangeForm } from './components/PasswordChangeForm';

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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">
        {t('title')}
      </h1>

      <TabGroup>
        <TabList className="flex space-x-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gray-700 dark:text-gray-300 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 data-[selected]:bg-white data-[selected]:text-indigo-700 data-[selected]:shadow dark:data-[selected]:bg-gray-700 dark:data-[selected]:text-indigo-400">
            {t('tabs.profile')}
          </Tab>
          <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gray-700 dark:text-gray-300 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 data-[selected]:bg-white data-[selected]:text-indigo-700 data-[selected]:shadow dark:data-[selected]:bg-gray-700 dark:data-[selected]:text-indigo-400">
            {t('tabs.security')}
          </Tab>
        </TabList>

        <TabPanels className="mt-6">
          {/* Profile Tab */}
          <TabPanel className="rounded-xl bg-white p-6 shadow dark:bg-gray-900">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('profile.title')}
              </h3>
              <ProfileEditForm user={user} />
            </div>
          </TabPanel>

          {/* Security Tab */}
          <TabPanel className="rounded-xl bg-white p-6 shadow dark:bg-gray-900">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('tabs.security')}
              </h3>
              <PasswordChangeForm />
            </div>
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
}
