'use client';

import { usePathname, Link } from '@/i18n/routing';
import { classMerge } from '@ragenai/common-ui/utils/cn';
import { useTranslations } from 'next-intl';
import type { SettingsPage } from '@/features/settings/registry';
import { SETTINGS_ICONS } from './settings-icons';

const iconClassName = 'size-4 shrink-0';

export type SettingsNavSection = Readonly<{
  /** Omitted for the first section, which needs no heading above the rail. */
  headingKey?: string;
  items: readonly SettingsPage[];
}>;

type Props = Readonly<{
  sections: readonly SettingsNavSection[];
  variant?: 'sidebar' | 'tabs';
}>;

export function SettingsNav({ sections, variant = 'sidebar' }: Props) {
  const pathname = usePathname();
  // Root namespace: entries carry fully qualified keys, because the two
  // registries this renders live in different namespaces.
  const t = useTranslations();
  // A section whose items were all filtered away renders nothing at all —
  // not an empty heading. A member seeing the word "Organization" over
  // nothing learns only that something is being kept from them.
  const visible = sections.filter((section) => section.items.length > 0);

  if (variant === 'tabs') {
    // Flattened on purpose. The mobile strip scrolls horizontally and has no
    // room for section headings; the grouping is a desktop affordance.
    const flat = visible.flatMap((section) => section.items);
    return (
      <nav className="flex overflow-x-auto px-4">
        {flat.map((item) => {
          const isActive =
            pathname === item.path || pathname.startsWith(item.path + '/');

          return (
            <Link
              key={item.id}
              href={item.path}
              className={classMerge(
                'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition-colors',
                isActive
                  ? 'border-border font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-4">
      {visible.map((section, index) => (
        <div key={section.headingKey ?? `section-${index}`}>
          {section.headingKey ? (
            <h2 className="mb-1 px-3 text-xs font-medium text-muted-foreground">
              {t(section.headingKey)}
            </h2>
          ) : null}
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const Icon = SETTINGS_ICONS[item.icon];
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
          </div>
        </div>
      ))}
    </nav>
  );
}
