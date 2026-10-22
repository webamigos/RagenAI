import 'server-only';

import { logger } from '@/lib/logger';

/**
 * How this panel reaches apps/web's branding endpoint.
 *
 * apps/web is the writer (see its `update-instance-branding-command.ts`): it
 * owns the storage the logo goes to and the cache every panel render reads,
 * so a save made here directly would land where the panel could not see it.
 * `RAGEN_APP_URL` and `INTERNAL_API_SECRET` are the pair the invitation
 * resend already uses.
 */

export const BRANDING_ENDPOINT = '/api/internal/instance-branding';

export type WebConnection = { appUrl: string; secret: string };

export function webConnection(): WebConnection | null {
  const appUrl = process.env.RAGEN_APP_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!appUrl || !secret) {
    return null;
  }
  return { appUrl: appUrl.replace(/\/+$/, ''), secret };
}

export const MISSING_CONNECTION =
  'Saving branding needs RAGEN_APP_URL and INTERNAL_API_SECRET configured on the admin app.';

/**
 * The stored logo as a `data:` URL for the preview, or null.
 *
 * Fetched server-side and inlined because the address this panel reaches
 * apps/web at (`http://web:3000` in compose) is not one the operator's browser
 * can open. A `data:` URL in `<img>` runs nothing even for an SVG.
 */
export async function fetchLogoPreview(
  adminUserId: string,
): Promise<string | null> {
  const connection = webConnection();
  if (!connection) {
    return null;
  }

  try {
    const url = new URL(`${connection.appUrl}${BRANDING_ENDPOINT}`);
    url.searchParams.set('adminUserId', adminUserId);
    const response = await fetch(url, {
      headers: { 'x-internal-secret': connection.secret },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      // 404 is the ordinary "no logo yet"; anything else is worth a line.
      if (response.status !== 404) {
        logger.warn(
          { status: response.status },
          'apps/web refused the branding logo preview',
        );
      }
      return null;
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch (error) {
    // The page still renders and says the preview is unavailable.
    logger.warn({ err: error }, 'Could not fetch the branding logo preview');
    return null;
  }
}
