import { getTranslations, getLocale } from 'next-intl/server';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { redirect } from '@/i18n/routing';
import { ProfileEditForm } from '../../user/profile/components/ProfileEditForm';
import { PasswordChangeForm } from '../../user/profile/components/PasswordChangeForm';
import { ActiveSessions } from './components/ActiveSessions';

export async function generateMetadata() {
  const t = await getTranslations('Metadata');
  return { title: t('settings-account.title') };
}

export default async function AccountSettingsPage() {
  const [user, tProfile, locale] = await Promise.all([
    getCurrentUser(),
    getTranslations('user-profile'),
    getLocale(),
  ]);

  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {tProfile('profile.title')}
        </h2>
        <div className="mt-4">
          <ProfileEditForm user={user} />
        </div>
      </section>

      <hr className="border-zinc-200 dark:border-zinc-800" />

      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {tProfile('tabs.security')}
        </h2>
        <div className="mt-4">
          <PasswordChangeForm />
        </div>
      </section>

      <hr className="border-zinc-200 dark:border-zinc-800" />

      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {tProfile('sessions.title')}
        </h2>
        <div className="mt-4">
          <ActiveSessions />
        </div>
      </section>
    </div>
  );
}
