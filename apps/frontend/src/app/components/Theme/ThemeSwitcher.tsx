'use client';

import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { classMerge } from '@salesyy/common-ui';

type Props = {
  className?: string;
};

export const ThemeSwitcher = ({ className }: Props) => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const handleClick = (theme: string) => {
    setTheme(theme);
  };

  const icon =
    theme === 'light' ? (
      <MoonIcon
        className="h-5 w-5 flex-none text-gray-400 cursor-pointer"
        aria-hidden="true"
        onClick={() => handleClick('dark')}
      />
    ) : (
      <SunIcon
        className="h-5 w-5 flex-none text-gray-400 cursor-pointer"
        aria-hidden="true"
        onClick={() => handleClick('light')}
      />
    );

  return <div className={classMerge('ml-4 w-[40px]', className)}>{icon}</div>;
};
