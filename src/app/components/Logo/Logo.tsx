'use client';

import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { useTransition, useEffect, useState } from 'react';
import { clearVisitorMessagesStats } from '../../lib/services/api';

export const Logo = () => {
  const { refresh, push } = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { theme, resolvedTheme } = useTheme();
  const [_isPending, setTransition] = useTransition();
  const [logoSrc, setLogoSrc] = useState('/assets/salesyy-logo-on-dark-bg.png');

  useEffect(() => {
    if (theme === 'dark' || resolvedTheme === 'dark') {
      setLogoSrc('/assets/salesyy-white-logo-white-on-dark-bg.png');
    } else {
      setLogoSrc('/assets/salesyy-logo-on-dark-bg.png');
    }
  }, [theme, resolvedTheme]);

  const handleResetVisits = async () => {
    await clearVisitorMessagesStats();
    setTransition(() => refresh());
  };
  const isClickableLogo = pathname !== `/${locale}`;

  return (
    <div className="flex lg:flex-1">
      <div className="-m-1.5 p-1.5 pl-0" onDoubleClick={handleResetVisits}>
        <span className="sr-only">SalesYY</span>
        <Image
          width={120}
          height={80}
          className={`h-8 w-auto ${isClickableLogo ? 'cursor-pointer' : ''}`}
          onClick={() => push('/')}
          src={logoSrc}
          alt="Logo"
        />
      </div>
    </div>
  );
};
