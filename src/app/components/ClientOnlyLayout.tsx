'use client';

import { useEffect, useState, ReactNode } from 'react';

type ClientOnlyLayoutProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

export function ClientOnlyLayout({
  children,
  fallback = null,
}: ClientOnlyLayoutProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    // Użyj requestAnimationFrame aby sprawdzić czy przeglądarka zakończyła renderowanie i malowanie
    // Po dwóch cyklach powinniśmy mieć stabilną stronę
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Dodajemy trochę opóźnienia, aby wszystkie zasoby mogły się załadować
        setTimeout(() => {
          setIsReady(true);
        }, 100);
      });
    });
  }, []);

  // Jeśli komponent nie jest zmontowany, pokaż fallback
  if (!isMounted) {
    return <>{fallback}</>;
  }

  // Jeśli komponent jest zmontowany, ale nie jest jeszcze gotowy, zachowaj stały układ
  // ale nie pokazuj jeszcze zawartości (aby uniknąć migotania)
  if (!isReady) {
    return <div style={{ visibility: 'hidden' }}>{children}</div>;
  }

  // Wszystko gotowe, pokaż zawartość
  return <>{children}</>;
}
