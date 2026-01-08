/**
 * Updated to use next-intl's localized Link component for automatic locale handling.
 * This ensures all links across the application maintain the current locale.
 */

import * as Headless from '@headlessui/react';
import React, { forwardRef } from 'react';
import { Link as I18nLink } from '@/i18n/routing';
import type { ComponentProps } from 'react';

type I18nLinkProps = ComponentProps<typeof I18nLink>;

export const Link = forwardRef(function Link(
  props: I18nLinkProps,
  ref: React.ForwardedRef<HTMLAnchorElement>
) {
  return (
    <Headless.DataInteractive>
      <I18nLink {...props} ref={ref} />
    </Headless.DataInteractive>
  );
});
