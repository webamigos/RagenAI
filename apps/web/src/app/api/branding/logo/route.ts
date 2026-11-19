import { NextResponse } from 'next/server';

import { logger } from '@/app/lib/utils/logger';
import { getInstanceBrandingLogoQuery } from '@/features/branding/services/queries/get-instance-branding-logo-query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Applied to every logo, and the reason an SVG may be served at all.
 *
 * Opened directly, an SVG is a document in this origin, and a script in it
 * would run with the panel's cookies. `sandbox` with no allowances gives it
 * an opaque origin and no scripts; `default-src 'none'` stops it fetching
 * anything. The upload check refuses scripts already; this is the layer that
 * holds if that check ever misses one. In `<img>`, where the panel and the
 * emails draw it, an SVG runs nothing in any case.
 */
const LOGO_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/**
 * The install's logo, for the panel, the sign-in pages and the emails.
 *
 * Public: the sign-in page shows it before anyone has a session, and a mail
 * client fetches it with none. It is branding, the same image on every page
 * of the install, and it is absent while the `instanceBranding` key is off.
 *
 * The URL the panel uses carries `?v=<updatedAt>`, so a new upload is a new
 * URL and this one can be cached for good.
 */
export async function GET() {
  try {
    const logo = await getInstanceBrandingLogoQuery();
    if (!logo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(logo.bytes), {
      status: 200,
      headers: {
        'Content-Type': logo.contentType,
        'Content-Length': String(logo.bytes.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Security-Policy': LOGO_CSP,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Could not serve the instance logo');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
