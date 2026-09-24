import { strToU8, zipSync } from 'fflate';
import { NextResponse } from 'next/server';

import { logger } from '@/app/lib/utils/logger';
import { getBrainWriteAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { getBrainBundleQuery } from '@/features/brain/services/queries/get-brain-bundle-query';

export const dynamic = 'force-dynamic';

/**
 * Download the organization's Brain bundle as a zip (spec E1): pages as
 * markdown with frontmatter, `graph.json`, `manifest.json`. The same gate as
 * the panel — owners and admins of an organization with the flag on — and
 * the same 404 for anyone else, so the route does not confirm the feature
 * exists. `X-Brain-Skipped` carries how many pages were left out, for a
 * caller that is not the panel.
 */
export async function GET() {
  // A curator's, not a reader's: the bundle is every page at once, and read-
  // only mode exists to show Brain to people who should browse it, not take
  // the whole of it away.
  const access = await getBrainWriteAccessQuery();
  if (!access) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const bundle = await getBrainBundleQuery(access.orgId);
  // `new Uint8Array(...)` copies into this realm's Uint8Array, which is the
  // one fflate checks with `instanceof`; a TextEncoder from another realm
  // (a test's jsdom) would otherwise be read as a directory.
  const zip = zipSync(
    Object.fromEntries(
      [...bundle.files].map(([path, content]) => [
        path,
        new Uint8Array(strToU8(content)),
      ]),
    ),
    { level: 6 },
  );
  logger.info(
    {
      orgId: access.orgId,
      pages: bundle.manifest.pages.length,
      skipped: bundle.skipped.length,
    },
    'brain: bundle exported',
  );
  const day = bundle.manifest.generatedAt.slice(0, 10);
  return new NextResponse(Buffer.from(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="ragen-brain-${day}.zip"`,
      'X-Brain-Skipped': String(bundle.skipped.length),
      'Cache-Control': 'no-store',
    },
  });
}
