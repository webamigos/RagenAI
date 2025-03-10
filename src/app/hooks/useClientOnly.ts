import { useState, useLayoutEffect } from 'react';

/**
 * Hook for handling client-side rendering only
 * Prevents UI flickering during hydration
 *
 * @returns {boolean} information whether the component is ready to be displayed
 */
export function useClientOnly() {
  const [isReady, setIsReady] = useState(false);

  useLayoutEffect(() => {
    setIsReady(true);
  }, []);

  return isReady;
}
