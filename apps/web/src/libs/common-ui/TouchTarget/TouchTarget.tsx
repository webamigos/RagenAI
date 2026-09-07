import React from 'react';

/**
 * Widens the hit area to 2.75rem on a coarse pointer without changing the
 * visual box — the WCAG target-size minimum, which several of these controls
 * are smaller than by design.
 *
 * It lives on its own because both `Sidebar` and `Navbar` need it. It arrived
 * with the component kit, was reproduced once when the sidebar primitives were
 * written, and a second copy for the navbar would have made it three.
 *
 * The absolutely positioned span needs a positioned ancestor to size against;
 * every caller here renders it inside one.
 */
export function TouchTarget({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span
        className="absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 [@media(pointer:fine)]:hidden"
        aria-hidden="true"
      />
      {children}
    </>
  );
}
