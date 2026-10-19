import { randomUUID } from 'node:crypto';

import db from '@ragenai/prisma-client';

import { logger } from '@/app/lib/utils/logger';
import { getStorageProvider } from '@/libs/storage';

import { INSTANCE_BRANDING_ID, LOGO_STORAGE_PREFIX } from '../../constants';
import { instanceBrandingInputSchema } from '../../contracts/branding.schemas';
import {
  DEFAULT_INSTANCE_PALETTE,
  checkLogo,
  isInstancePalette,
  type StoredInstanceBranding,
  type UpdateInstanceBrandingInput,
  type UpdateInstanceBrandingResult,
} from '../../contracts/branding.types';
import { clearInstanceBrandingCache } from '../queries/get-instance-branding-query';

function toStored(
  row: {
    productName: string | null;
    primaryToken: string | null;
    logoStorageKey: string | null;
  } | null,
): StoredInstanceBranding {
  const token = row?.primaryToken;
  return {
    productName: row?.productName ?? null,
    palette: isInstancePalette(token) ? token : DEFAULT_INSTANCE_PALETTE,
    hasLogo: Boolean(row?.logoStorageKey),
  };
}

async function deleteQuietly(key: string, why: string): Promise<void> {
  await getStorageProvider()
    .delete(key)
    .catch((error: unknown) => {
      logger.warn({ err: error, key }, why);
    });
}

/**
 * Save the install's branding: name, palette, and optionally a new logo or
 * none.
 *
 * **The only writer.** `apps/admin` is where an operator edits branding
 * (ADR-35: platform-wide), but it posts here rather than writing the row
 * itself, for two reasons that both come down to this process owning the
 * result: the logo goes through this app's storage binding, which the admin
 * container has no volume for under `STORAGE_PROVIDER=local`; and the cache
 * that every panel render reads lives here, so only a save made here can
 * clear it at once.
 *
 * The validation is authoritative here even though the admin panel checks
 * first — the panel's check is for a quick answer, this one is the gate.
 *
 * Order matters: the new logo is uploaded before the row points at it, and
 * the old one is deleted only after the row stops pointing at it, so no
 * reader ever sees a key with no object behind it. A failed row write
 * removes the upload it orphaned.
 */
export async function updateInstanceBrandingCommand(
  input: UpdateInstanceBrandingInput,
): Promise<UpdateInstanceBrandingResult> {
  const parsed = instanceBrandingInputSchema.safeParse({
    productName: input.productName ?? '',
    palette: input.palette,
    removeLogo: input.removeLogo ?? false,
  });
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues.map((issue) => issue.message).join(' '),
    };
  }
  const { productName, palette, removeLogo } = parsed.data;

  const logoCheck = input.logo ? checkLogo(input.logo) : null;
  if (logoCheck && !logoCheck.ok) {
    return { ok: false, reason: logoCheck.reason };
  }

  const existing = await db.instanceBranding.findUnique({
    where: { id: INSTANCE_BRANDING_ID },
    select: { productName: true, primaryToken: true, logoStorageKey: true },
  });
  const previousKey = existing?.logoStorageKey ?? null;

  let newKey: string | null = null;
  if (input.logo && logoCheck?.ok) {
    newKey = `${LOGO_STORAGE_PREFIX}logo-${randomUUID()}.${logoCheck.extension}`;
    await getStorageProvider().upload(newKey, Buffer.from(input.logo));
  }

  let logoStorageKey: string | null;
  if (newKey) {
    logoStorageKey = newKey;
  } else if (removeLogo) {
    logoStorageKey = null;
  } else {
    logoStorageKey = previousKey;
  }

  const data = { productName, primaryToken: palette, logoStorageKey };
  let saved;
  try {
    saved = await db.instanceBranding.upsert({
      where: { id: INSTANCE_BRANDING_ID },
      update: data,
      create: { id: INSTANCE_BRANDING_ID, ...data },
      select: { productName: true, primaryToken: true, logoStorageKey: true },
    });
  } catch (error) {
    if (newKey) {
      await deleteQuietly(newKey, 'Could not remove an orphaned logo upload');
    }
    throw error;
  }

  if (previousKey && previousKey !== logoStorageKey) {
    await deleteQuietly(previousKey, 'Could not delete the replaced logo');
  }

  clearInstanceBrandingCache();

  return { ok: true, before: toStored(existing), after: toStored(saved) };
}
