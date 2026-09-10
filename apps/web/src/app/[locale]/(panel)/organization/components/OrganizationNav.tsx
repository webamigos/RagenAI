'use client';

import { usePathname, Link } from '@/i18n/routing';
import { classMerge } from '@ragenai/common-ui/utils/cn';
import { useTranslations } from 'next-intl';
import { organizationRegistry } from '@/features/settings/registry';
import { SETTINGS_ICONS as ORGANIZATION_ICONS } from '../../settings/components/settings-icons';

const iconClassName = 'size-4 shrink-0';

/**
 * The organization rail, rendered from `organizationRegistry`.
 *
 * It used to hold its own hardcoded array. Two lists of the same screens drift
 * — and the copy here had no visibility information at all, which is safe only
 * while `/organization/layout.tsx` gates the whole group. Gap 8 wants these
 * screens shown beside the personal ones, where that guard does not reach, so
 * the list has to carry its own answer to "may this person see it".
 *
 * This component still renders every entry. It sits *inside* the guarded
 * layout, so anyone reaching it has already passed the check the entries
 * describe; filtering here would be theatre. The filter is applied where the
 * list is shown outside that layout.
 */
export function OrganizationNav() {
  const pathname = usePathname();
  const t = useTranslations('organization-page.nav');

  return (
    <nav className="flex flex-col gap-0.5">
      {organizationRegistry.map((item) => {
        const Icon = ORGANIZATION_ICONS[item.icon];
        const isActive =
          pathname === item.path || pathname.startsWith(item.path + '/');

        return (
          <Link
            key={item.id}
            href={item.path}
            className={classMerge(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted/50',
            )}
          >
            <Icon className={iconClassName} />
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
