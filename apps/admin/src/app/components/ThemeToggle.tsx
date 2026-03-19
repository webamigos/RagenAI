'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-20" />;
  }

  const options = [
    { value: 'light', icon: Sun },
    { value: 'dark', icon: Moon },
    { value: 'system', icon: Monitor },
  ] as const;

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-sidebar-border bg-sidebar-accent/50 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          className={cn(
            'rounded-sm p-1.5 transition-colors',
            theme === opt.value
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/50 hover:text-sidebar-foreground/80',
          )}
          title={opt.value}
        >
          <opt.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
