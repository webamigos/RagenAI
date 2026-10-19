'use client';

import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useTransition, useEffect, useState } from 'react';

import { usePathname, useRouter } from '@/i18n/routing';
import { clearVisitorMessagesStats } from '../../lib/services/api';
import { useCloseThread } from '@/app/hooks/useCloseThreads';
import { classMerge } from '@ragenai/common-ui/index';
import { useInstanceBranding } from '@/context/InstanceBrandingContext';
import { DEFAULT_PRODUCT_NAME } from '@/features/branding/contracts/branding.types';

type Props = {
  className?: string;
  disableLink?: boolean;
  ignoreTheme?: boolean;
  /**
   * For the sidebar's brand row, which is a 48px line rather than a page
   * header. Two things differ and both are load-bearing:
   *
   * - No `pb-4`. That padding exists for the auth screens, where the logo
   *   sits above a form; in a fixed-height row it just pushes the mark up.
   * - An explicit width. `w-auto` on a `loading="lazy"` image that has not
   *   loaded yet computes to **zero** width, so the element has no area, so
   *   it never intersects the viewport, so it never loads — a deadlock that
   *   renders nothing at all. The wordmark is 1754x620, so 80x28 holds it at
   *   its own ratio. Change one of these numbers and you must change the
   *   other: a width that no longer matches the artwork does not crop, it
   *   stretches the letterforms.
   */
  compact?: boolean;
};

export const Logo = ({
  className,
  disableLink = false,
  ignoreTheme: _ignoreTheme = false,
  compact = false,
}: Props) => {
  const { refresh } = useRouter();
  const pathname = usePathname();
  const { theme, resolvedTheme } = useTheme();
  const [_isPending, setTransition] = useTransition();
  const [logoSrc, setLogoSrc] = useState('/assets/ragen-logo-on-light-bg.svg');

  const { handleCloseThread } = useCloseThread();
  const branding = useInstanceBranding();

  useEffect(() => {
    if (theme === 'dark' || resolvedTheme === 'dark') {
      setLogoSrc('/assets/ragen-logo-on-dark-bg.svg');
    } else {
      setLogoSrc('/assets/ragen-logo-on-light-bg.svg');
    }
  }, [theme, resolvedTheme]);

  const handleResetVisits = async () => {
    await clearVisitorMessagesStats();
    setTransition(() => refresh());
  };
  const isClickableLogo = pathname !== `/`;
  const onClick = () => {
    if (!disableLink) {
      handleCloseThread(true);
    }
  };

  /**
   * What the mark is, in the order an install can supply it:
   *
   * 1. an uploaded logo. One file for both themes — the operator uploads one,
   *    so it is drawn as is. Not optimised by Next: an SVG would need
   *    `dangerouslyAllowSVG`, and the file is already the size it was
   *    checked at. Its proportions are the operator's, so it is held by
   *    height, capped in width and never stretched.
   * 2. a product name with no logo: the name as a wordmark, because Ragen's
   *    artwork above another product's name would be wrong twice.
   * 3. neither: today's Ragen lockup for the theme.
   */
  let mark: React.ReactNode;
  if (branding.logoUrl) {
    mark = (
      <Image
        width={160}
        height={56}
        unoptimized
        priority={compact}
        className={classMerge(
          compact
            ? 'h-7 w-auto max-w-32 object-contain object-left'
            : 'h-14 w-auto max-w-60 object-contain',
          isClickableLogo ? 'cursor-pointer' : '',
          className,
        )}
        onClick={onClick}
        src={branding.logoUrl}
        alt="Logo"
        data-testid="instance-logo"
      />
    );
  } else if (branding.productName !== DEFAULT_PRODUCT_NAME) {
    mark = (
      <span
        aria-hidden
        className={classMerge(
          'block truncate font-display font-semibold text-foreground',
          compact ? 'max-w-40 text-xl leading-7' : 'text-3xl',
          isClickableLogo ? 'cursor-pointer' : '',
          className,
        )}
        onClick={onClick}
        data-testid="instance-wordmark"
      >
        {branding.productName}
      </span>
    );
  } else {
    mark = (
      <Image
        width={120}
        height={80}
        priority={compact}
        className={classMerge(
          compact
            ? `h-7 w-20 ${isClickableLogo ? 'cursor-pointer' : ''}`
            : `h-auto w-auto ${isClickableLogo ? 'cursor-pointer' : ''}`,
          className,
        )}
        onClick={onClick}
        src={logoSrc}
        alt="Logo"
      />
    );
  }

  return (
    <div className="flex">
      <div
        className={compact ? 'pl-0' : 'pb-4 pl-0'}
        onDoubleClick={handleResetVisits}
      >
        <span className="sr-only">{branding.productName}</span>
        {mark}
      </div>
    </div>
  );
};
