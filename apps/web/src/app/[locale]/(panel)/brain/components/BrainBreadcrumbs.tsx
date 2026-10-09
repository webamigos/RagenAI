'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '@ragenai/common-ui/Breadcrumb';
import { TouchTarget } from '@ragenai/common-ui/TouchTarget';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Fragment } from 'react';

import { withLanguage } from '@/features/brain/utils/with-language';

/**
 * Where a Brain screen below a tab sits: `Brain / Strony wiedzy / <here>`.
 * One trail for every such screen, in place of the three back links they
 * had ("← Brain", "← Ragen Brain", "← Strony wiedzy"), each pointing
 * somewhere different. The language filter rides along, as on the tabs.
 */
export function BrainBreadcrumbs({ current }: { current: string }) {
  const t = useTranslations('brain');
  const language = useSearchParams().get('lang');
  const trail = [
    { label: t('title'), href: withLanguage('/brain/overview', language) },
    { label: t('tabs.pages'), href: withLanguage('/brain', language) },
  ];
  return (
    <Breadcrumb className="mb-2 min-w-0" data-testid="brain-breadcrumbs">
      {trail.map((crumb) => (
        <Fragment key={crumb.href}>
          <BreadcrumbItem className="shrink-0">
            <BreadcrumbLink
              href={crumb.href}
              className="relative rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <TouchTarget>{crumb.label}</TouchTarget>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
        </Fragment>
      ))}
      <BreadcrumbItem className="min-w-0">
        <BreadcrumbLink current className="truncate">
          {current}
        </BreadcrumbLink>
      </BreadcrumbItem>
    </Breadcrumb>
  );
}
