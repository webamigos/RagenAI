'use client';

import { usePathname, Link } from '@/i18n/routing';
import { classMerge } from '@ragenai/common-ui/utils/cn';
import { useTranslations } from 'next-intl';
import type { SettingsPage } from '@/features/settings/registry';
import { SETTINGS_ICONS } from './settings-icons';

const iconClassName = 'size-4 shrink-0';

export type SettingsNavSection = Readonly<{
  /**
   * Every section has one now. The first used to go bare, which worked while
   * there were two — but with three the reader needs to know what the top
   * group *is*, not only what the ones below it are not.
   */
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
                  ? 'border-[--marker] font-medium text-foreground'
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
            // The eyebrow style, and the one place `docs/panel-ux-rules.md`
            // rule 18 allows caps.
            <h2 className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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
                    // The marker pattern, as in the app sidebar and the
                    // knowledge base rail: an accent fill plus the crimson
                    // inset hairline. `bg-muted` marked the active item with
                    // the same grey a hover uses, so the two states differed
                    // only while the pointer was somewhere else.
                    isActive
                      ? 'bg-accent font-medium text-accent-foreground shadow-[inset_2px_0_0_var(--marker)]'
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
