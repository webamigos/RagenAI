'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import {
  SidebarBody,
  SidebarDivider,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from '@ragenai/common-ui/Sidebar';

import { usePathname } from '@/i18n/routing';
import { SETTINGS_ICONS } from '@/app/[locale]/(panel)/settings/components/settings-icons';
import type { SettingsPage } from '@/features/settings/registry';

import {
  DEFAULT_RETURN_PATH,
  returnPath,
  sectionOf,
  type MenuSection,
} from './return-path';

/** What the sidebar needs of a registry entry, which is all that crosses from the server. */
export type SectionNavItem = Pick<
  SettingsPage,
  'id' | 'path' | 'labelKey' | 'icon'
>;

/**
 * A section's menu, in the sidebar's body in place of the thread list while
 * the reader is inside that section: the organization's pages under
 * `/organization` (#1399), the user's own under `/settings`.
 *
 * Both used to be a second column beside the sidebar, which left the page a
 * third less width on a laptop. The items are filtered on the server, in the
 * panel layout, with the same predicate the pages' guards use — this component
 * draws what it is handed and decides nothing about who may see what.
 *
 * Renders nothing outside its section.
 */
export function SectionSidebarBody({
  section,
  titleKey,
  items,
}: {
  section: MenuSection;
  /** A fully qualified message key for the heading above the items. */
  titleKey: string;
  items: readonly SectionNavItem[];
}) {
  const pathname = usePathname();
  const t = useTranslations();
  const [back, setBack] = useState(DEFAULT_RETURN_PATH);

  const inSection = sectionOf(pathname) === section;

  // Read in an effect, not during render: storage does not exist on the server,
  // and a link whose target differed between the server's HTML and the client's
  // first render would be a hydration mismatch. The default is right until then.
  useEffect(() => {
    if (!inSection) {
      return;
    }
    try {
      setBack(returnPath(window.sessionStorage));
    } catch {
      setBack(DEFAULT_RETURN_PATH);
    }
  }, [inSection, pathname]);

  if (!inSection) {
    return null;
  }

  return (
    <SidebarBody>
      <SidebarSection>
        <SidebarItem href={back} data-testid={`${section}-back`}>
          <ArrowLeftIcon className="size-5 shrink-0 stroke-muted-foreground" />
          <SidebarLabel className="font-normal">
            {t('sidebar.back-to-main-menu')}
          </SidebarLabel>
        </SidebarItem>
      </SidebarSection>

      <SidebarDivider className="my-2" />

      <SidebarSection>
        <SidebarHeading>{t(titleKey)}</SidebarHeading>
        {items.map((item) => {
          const Icon = SETTINGS_ICONS[item.icon];
          const isActive =
            pathname === item.path || pathname.startsWith(`${item.path}/`);

          return (
            <SidebarItem
              key={item.id}
              href={item.path}
              current={isActive}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="size-5 shrink-0 stroke-muted-foreground" />
              <SidebarLabel className="font-normal">
                {t(item.labelKey)}
              </SidebarLabel>
            </SidebarItem>
          );
        })}
      </SidebarSection>
    </SidebarBody>
  );
}
