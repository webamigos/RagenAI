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
};

export const Logo = ({
  className,
  disableLink = false,
  ignoreTheme = false,
}: Props) => {
  const { refresh, } = useRouter();
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
      <div className="pb-4 pl-0" onDoubleClick={handleResetVisits}>
        <span className="sr-only">Ragen AI</span>
        <Image
          width={120}
          height={80}
          className={classMerge(
            `h-auto w-auto ${isClickableLogo ? 'cursor-pointer' : ''}`,
            className
          )}
          onClick={() => {
            if (!disableLink) {
              handleCloseThread(true)
            }
          }}
          src={logoSrc}
          alt="Logo"
        />
      </div>
    </div>
  );
};
