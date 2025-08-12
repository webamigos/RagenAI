'use client';

import React from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '@ragenai/common-ui';
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
    <div className={className}>
      <Breadcrumb>
        {breadcrumbs.map((item, index) => (
          <React.Fragment key={index}>
            <BreadcrumbItem>
              <BreadcrumbLink href={item.href} current={item.current}>
                {item.label}
              </BreadcrumbLink>
            </BreadcrumbItem>

            {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
          </React.Fragment>
        ))}
      </Breadcrumb>
    </div>
  );
};
