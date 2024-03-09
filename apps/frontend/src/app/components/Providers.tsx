'use client';

import { ThemeProvider } from 'next-themes';

type Props = {
  readonly children: React.ReactNode;
};

export function Providers({ children }: Props) {
  return <ThemeProvider attribute="class">{children}</ThemeProvider>;
}
