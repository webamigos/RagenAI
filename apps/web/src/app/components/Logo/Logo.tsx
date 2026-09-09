'use client';

import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useTransition, useEffect, useState } from 'react';

import { usePathname, useRouter } from '@/i18n/routing';
import { clearVisitorMessagesStats } from '../../lib/services/api';
import { useCloseThread } from '@/app/hooks/useCloseThreads';
import { classMerge } from '@ragenai/common-ui/index';

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
   *   renders nothing at all. The lockup is 2290x620, so 104x28 holds it.
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

  return (
    <div className="flex">
      <div
        className={compact ? 'pl-0' : 'pb-4 pl-0'}
        onDoubleClick={handleResetVisits}
      >
        <span className="sr-only">Ragen AI</span>
        <Image
          width={120}
          height={80}
          priority={compact}
          className={classMerge(
            compact
              ? `h-7 w-[104px] ${isClickableLogo ? 'cursor-pointer' : ''}`
              : `h-auto w-auto ${isClickableLogo ? 'cursor-pointer' : ''}`,
            className,
          )}
          onClick={() => {
            if (!disableLink) {
              handleCloseThread(true);
            }
          }}
          src={logoSrc}
          alt="Logo"
        />
      </div>
    </div>
  );
};
