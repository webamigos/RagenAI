import { getTranslations } from 'next-intl/server';
import { SettingsNav } from './components/SettingsNav';
import { getCurrentUser, getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import { isAppAdmin, isOrgAdmin, hasOrgRole } from '@/lib/auth-access-control';
import { settingsRegistry } from '@/features/settings/registry';
import { filterSettingsPages } from '@/features/settings/filter';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default async function SettingsLayout({ children }: Props) {
  const [t, user, activeOrgId] = await Promise.all([
    getTranslations('settings-page'),
    getCurrentUser(),
    getOrgIdFromAuth(),
  ]);

  const member = activeOrgId ? await getActiveMember(activeOrgId) : null;
  const items = filterSettingsPages(settingsRegistry, {
    isAppAdmin: isAppAdmin(user),
    isOrgAdmin: member ? isOrgAdmin(member.role) : false,
    isOrgOwner: member ? hasOrgRole(member.role, 'owner') : false,
  });

  return (
    <div className="flex min-h-full">
      <div className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 p-6">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-white mb-4">
          {t('title')}
        </h1>
        <SettingsNav items={items} />
      </div>
      <div className="flex-1 p-6 overflow-auto">{children}</div>
    </div>
  );
}
