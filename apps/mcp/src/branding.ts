import type { FastMCP } from 'fastmcp';

import icon from './assets/ragen-icon.js';
import type { RagenSession } from './auth.js';

// Packaged with the server, so stdio and self-hosted clients need no external fetch.
export const serverIcons = [
  {
    src: `data:image/png;base64,${icon}`,
    mimeType: 'image/png',
    sizes: ['512x512'],
  },
];

/** Public branding only; these routes expose no organization or user data. */
export function registerBrandingRoutes(server: FastMCP<RagenSession>) {
  const bytes = new Uint8Array(Buffer.from(icon, 'base64'));
  for (const path of ['/icon.png', '/favicon.ico']) {
    server.getApp().get(
      path,
      (context) =>
        new Response(bytes, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
          },
        }),
    );
  }
}
