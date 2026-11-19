'use client';

import { createContext, useContext } from 'react';

import {
  DEFAULT_INSTANCE_BRANDING,
  DEFAULT_INSTANCE_PALETTE,
  type InstanceBranding,
} from '@/features/branding/contracts/branding.types';

/**
 * The install's branding, resolved on the server by
 * `getInstanceBrandingQuery` and handed to the client components that draw
 * it — the logo above all.
 *
 * The fallback is today's Ragen branding, so a component rendered outside the
 * provider (a setup screen, a test) looks exactly as it did before branding
 * existed.
 */
const InstanceBrandingContext = createContext<InstanceBranding>(
  DEFAULT_INSTANCE_BRANDING,
);

export function useInstanceBranding(): InstanceBranding {
  return useContext(InstanceBrandingContext);
}

type Props = {
  branding: InstanceBranding;
  children: React.ReactNode;
};

/**
 * Also where the palette is applied. The marker element is what
 * `:root:has([data-palette='…'])` in `global.css` matches, which swaps the
 * brand ramp on the document root — so the palette reaches dialogs and
 * popovers portalled to `<body>`, outside this subtree, and is in the
 * server-rendered HTML, so the first paint is already the right colour. An
 * attribute set from an effect would flash the default navy on every load.
 *
 * No marker for the default palette: the CSS has no block for it, and an
 * install without branding renders exactly the markup it did before.
 */
export function InstanceBrandingProvider({ branding, children }: Props) {
  return (
    <InstanceBrandingContext.Provider value={branding}>
      {branding.palette !== DEFAULT_INSTANCE_PALETTE && (
        <span hidden data-palette={branding.palette} />
      )}
      {children}
    </InstanceBrandingContext.Provider>
  );
}
