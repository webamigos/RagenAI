'use client';

import Image from 'next/image';
import { useTheme } from 'next-themes';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { clearVisitorMessagesStats } from '../../lib/services/api';

export const Logo = () => {
  const { refresh } = useRouter();
  const { theme } = useTheme();
  const [_isPending, setTransition] = useTransition();

  const handleResetVisits = async () => {
    await clearVisitorMessagesStats();
    setTransition(() => refresh());
  };

  return (
    <div className="flex lg:flex-1">
      <div className="-m-1.5 p-1.5 pl-0" onDoubleClick={handleResetVisits}>
        <span className="sr-only">SalesYY</span>
        <Image
          width={120}
          height={80}
          className="h-8 w-auto"
          src={
            theme === 'dark'
              ? '/assets/salesyy-white-logo-white-on-dark-bg.png'
              : '/assets/salesyy-logo-on-dark-bg.png'
          }
          alt="Logo"
        />
      </div>
    </div>
  );
};
