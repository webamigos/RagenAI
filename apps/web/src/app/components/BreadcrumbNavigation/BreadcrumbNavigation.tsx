'use client';

import React from 'react';
import clsx from 'clsx';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '@ragenai/common-ui/Breadcrumb';
import { useBreadcrumbs } from '@/app/hooks/useBreadcrumbs';

interface BreadcrumbNavigationProps {
  threadId?: string;
  className?: string;
}

export const BreadcrumbNavigation = ({
  threadId,
  className,
}: BreadcrumbNavigationProps) => {
  const breadcrumbs = useBreadcrumbs(threadId);

  if (breadcrumbs.length < 2) {
    return null;
  }

  return (
    <div className={clsx('min-w-0', className)}>
      {/*
        Below `sm` only the last crumb is shown, truncated. The trail shares a
        row with the assistant selector and the header's buttons, and at 375px
        the full "Assistants › name › Conversation" pushed the selector off
        the edge. The sidebar already says where you are; the selector is the
        control you came for.
      */}
      <Breadcrumb className="min-w-0">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <React.Fragment key={index}>
              <BreadcrumbItem
                className={isLast ? 'min-w-0' : 'shrink-0 max-sm:hidden'}
              >
                <BreadcrumbLink
                  href={item.href}
                  current={item.current}
                  className={isLast ? 'truncate' : undefined}
                >
                  {item.label}
                </BreadcrumbLink>
              </BreadcrumbItem>

              {!isLast && <BreadcrumbSeparator className="max-sm:hidden" />}
            </React.Fragment>
          );
        })}
      </Breadcrumb>
    </div>
  );
};
