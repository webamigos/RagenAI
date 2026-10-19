'use server';

import { revalidatePath } from 'next/cache';
import {
  DEFAULT_INSTANCE_PALETTE,
  PLATFORM_FEATURE_DEFAULTS_KEY,
  checkLogo,
  isInstancePalette,
  resolveInstanceFeature,
  sanitizeFeatureOverrides,
  type FeatureSource,
  type InstancePalette,
} from '@ragenai/platform-contracts';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

import { readBrandingForm } from './schema';
import {
  BRANDING_ENDPOINT,
  MISSING_CONNECTION,
  webConnection,
} from './web-branding';

export type InstanceBrandingState = {
  productName: string | null;
  palette: InstancePalette;
  hasLogo: boolean;
  updatedAt: string | null;
  /** Whether the panel shows any of it, and which layer decided. */
  enabled: boolean;
  enabledSource: FeatureSource;
};

export type SaveBrandingOutcome = { ok: true } | { ok: false; reason: string };

/**
 * What is stored, and whether it is shown.
 *
 * Read here rather than through apps/web: a read needs neither the storage
 * nor the cache, and this panel shares the database.
 */
export async function getInstanceBrandingAction(): Promise<InstanceBrandingState> {
  await requireAdmin();

  const [row, defaults] = await Promise.all([
    prisma.instanceBranding.findUnique({
      where: { id: 1 },
      select: {
        productName: true,
        logoStorageKey: true,
        primaryToken: true,
        updatedAt: true,
      },
    }),
    prisma.settings.findUnique({
      where: { key: PLATFORM_FEATURE_DEFAULTS_KEY },
    }),
  ]);

  let platformDefaults = {};
  try {
    platformDefaults = defaults
      ? sanitizeFeatureOverrides(
          JSON.parse(defaults.value) as Record<string, unknown>,
        )
      : {};
  } catch {
    // A hand-edited row that will not parse decides nothing; apps/web reads
    // it the same way and lands on the code default.
    platformDefaults = {};
  }
  const resolved = resolveInstanceFeature('instanceBranding', platformDefaults);

  return {
    productName: row?.productName ?? null,
    palette: isInstancePalette(row?.primaryToken)
      ? (row?.primaryToken as InstancePalette)
      : DEFAULT_INSTANCE_PALETTE,
    hasLogo: Boolean(row?.logoStorageKey),
    updatedAt: row?.updatedAt.toISOString() ?? null,
    enabled: resolved.value,
    enabledSource: resolved.source,
  };
}

/**
 * Save the install's branding through apps/web, which stores it.
 *
 * Checks here first — the name, the palette, the logo's type, size and SVG
 * content, with the same shared rules apps/web applies — so a mistake comes
 * back without a round trip. apps/web checks again and is the gate.
 */
export async function saveInstanceBrandingAction(
  form: FormData,
): Promise<SaveBrandingOutcome> {
  const admin = await requireAdmin();

  const parsed = readBrandingForm(form);
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues.map((issue) => issue.message).join(' '),
    };
  }

  const logoField = form.get('logo');
  const logo =
    logoField instanceof File && logoField.size > 0 ? logoField : null;
  if (logo) {
    const check = checkLogo(new Uint8Array(await logo.arrayBuffer()));
    if (!check.ok) {
      return { ok: false, reason: check.reason };
    }
  }

  const connection = webConnection();
  if (!connection) {
    return { ok: false, reason: MISSING_CONNECTION };
  }

  const body = new FormData();
  body.set('adminUserId', admin.id);
  body.set('productName', parsed.data.productName);
  body.set('palette', parsed.data.palette);
  body.set('removeLogo', String(parsed.data.removeLogo));
  if (logo) {
    body.set('logo', logo, logo.name || 'logo');
  }

  let outcome: SaveBrandingOutcome;
  let stored: Record<string, unknown> | null = null;
  let previous: Record<string, unknown> | null = null;
  try {
    const response = await fetch(`${connection.appUrl}${BRANDING_ENDPOINT}`, {
      method: 'POST',
      headers: { 'x-internal-secret': connection.secret },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    };

    if (response.ok) {
      outcome = { ok: true };
      previous = payload.before ?? null;
      stored = payload.after ?? null;
    } else {
      outcome = {
        ok: false,
        reason: payload.error
          ? payload.error
          : `apps/web refused the save: ${response.status}`,
      };
    }
  } catch (error) {
    outcome = {
      ok: false,
      reason: `Could not reach apps/web: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!outcome.ok) {
    logger.error({ reason: outcome.reason }, 'Instance branding save failed');
  }

  // Either way, as with the invitation resend: a refused rebrand is the
  // thing somebody asks about later. The branding belongs to the install,
  // not to an organization, so it is filed as a security event — without
  // one `AuditLog` cannot hold the row and the call throws.
  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.instanceBrandingChanged,
    entityType: 'instance_branding',
    entityId: 'instance',
    before: previous,
    after: stored ?? {
      requested: {
        productName: parsed.data.productName,
        palette: parsed.data.palette,
        removeLogo: parsed.data.removeLogo,
        newLogo: Boolean(logo),
      },
      outcome,
    },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED', severity: 'info' },
  });

  revalidatePath('/branding');
  return outcome;
}
