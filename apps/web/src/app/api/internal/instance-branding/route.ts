import { type NextRequest, NextResponse } from 'next/server';

import db from '@ragenai/prisma-client';

import {
  InternalAuthError,
  recordInternalAuthFailure,
  verifyInternalSecret,
} from '@/app/api/v1/utils';
import { logger } from '@/app/lib/utils/logger';
import { isAppAdmin } from '@/lib/auth-access-control';
import { updateInstanceBrandingCommand } from '@/features/branding/services/commands/update-instance-branding-command';
import { getInstanceBrandingLogoQuery } from '@/features/branding/services/queries/get-instance-branding-logo-query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PATH = '/api/internal/instance-branding';

/**
 * The instance branding, on behalf of the platform admin panel.
 *
 * `apps/admin` is where an operator edits it (ADR-35), and this is where it
 * is written: the logo goes through this app's storage, and the branding
 * cache every panel render reads is this process's — see
 * `update-instance-branding-command.ts`.
 *
 * Two gates, as on the invitation resend: `verifyInternalSecret` proves the
 * caller is a Ragen service, and the acting administrator is then re-read from
 * the database and must still hold the platform role and not be banned. The
 * secret alone would let any service holding it rebrand the install.
 */

type Gate = { ok: true } | { ok: false; response: NextResponse };

function checkSecret(request: NextRequest): Gate {
  try {
    verifyInternalSecret(request);
    return { ok: true };
  } catch (error) {
    if (error instanceof InternalAuthError) {
      recordInternalAuthFailure(request, PATH, 'bad secret');
      return {
        ok: false,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: 'Server error' }, { status: 500 }),
    };
  }
}

async function checkAdmin(
  request: NextRequest,
  adminUserId: string | null,
): Promise<Gate> {
  const admin = adminUserId
    ? await db.user.findUnique({
        where: { id: adminUserId },
        select: { id: true, role: true, banned: true },
      })
    : null;

  if (!admin || admin.banned || !isAppAdmin(admin)) {
    recordInternalAuthFailure(
      request,
      PATH,
      'caller is not a platform administrator',
    );
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { ok: true };
}

/**
 * Save. A multipart form: `adminUserId`, `productName`, `palette`,
 * `removeLogo` (`'true'` or `'false'`) and, optionally, the `logo` file.
 */
export async function POST(request: NextRequest) {
  const secret = checkSecret(request);
  if (!secret.ok) {
    return secret.response;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const adminUserId = form.get('adminUserId');
  const admin = await checkAdmin(
    request,
    typeof adminUserId === 'string' ? adminUserId : null,
  );
  if (!admin.ok) {
    return admin.response;
  }

  const logoField = form.get('logo');
  const logo =
    logoField instanceof File && logoField.size > 0
      ? new Uint8Array(await logoField.arrayBuffer())
      : null;

  try {
    const result = await updateInstanceBrandingCommand({
      productName: form.get('productName'),
      palette: form.get('palette'),
      removeLogo: form.get('removeLogo'),
      logo,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Could not save the instance branding');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * The stored logo for the admin panel's preview, whether or not the key is
 * on — the operator has to see what they uploaded before switching it on.
 * The public route answers 404 in that state, so this is the only way to it.
 */
export async function GET(request: NextRequest) {
  const secret = checkSecret(request);
  if (!secret.ok) {
    return secret.response;
  }

  const admin = await checkAdmin(
    request,
    request.nextUrl.searchParams.get('adminUserId'),
  );
  if (!admin.ok) {
    return admin.response;
  }

  try {
    const logo = await getInstanceBrandingLogoQuery({ ignoreFeatureKey: true });
    if (!logo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(logo.bytes), {
      status: 200,
      headers: {
        'Content-Type': logo.contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Could not read the instance logo');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
