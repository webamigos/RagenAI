import db from '@ragenai/prisma-client';
import {
  LOGO_CONTENT_TYPES,
  LOGO_EXTENSIONS,
  type LogoType,
} from '@ragenai/platform-contracts';

import { getStorageProvider, StorageNotFoundError } from '@/libs/storage';
import { isInstanceFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

import { INSTANCE_BRANDING_ID } from '../../constants';

export type InstanceBrandingLogo = {
  bytes: Buffer;
  contentType: string;
};

/** The content type a stored key's extension names, or null for any other. */
export function contentTypeForLogoKey(key: string): string | null {
  const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  const type = (Object.keys(LOGO_EXTENSIONS) as LogoType[]).find(
    (candidate) => LOGO_EXTENSIONS[candidate] === extension,
  );
  return type ? LOGO_CONTENT_TYPES[type] : null;
}

/**
 * The uploaded logo, or null when there is none to serve.
 *
 * `ignoreFeatureKey` is for the admin panel's preview only, which has to show
 * what is stored before the operator switches the key on. Every public path
 * leaves it false, so with the key off the logo is as absent as the rest of
 * the row.
 *
 * Not cached: it is fetched once per browser per upload (the URL is versioned
 * and served immutable), and a stale copy in memory would outlive a delete.
 */
export async function getInstanceBrandingLogoQuery({
  ignoreFeatureKey = false,
}: { ignoreFeatureKey?: boolean } = {}): Promise<InstanceBrandingLogo | null> {
  if (
    !ignoreFeatureKey &&
    !(await isInstanceFeatureEnabledQuery('instanceBranding'))
  ) {
    return null;
  }

  const row = await db.instanceBranding.findUnique({
    where: { id: INSTANCE_BRANDING_ID },
    select: { logoStorageKey: true },
  });
  const key = row?.logoStorageKey;
  if (!key) {
    return null;
  }

  const contentType = contentTypeForLogoKey(key);
  if (!contentType) {
    return null;
  }

  try {
    const bytes = await getStorageProvider().download(key);
    return { bytes, contentType };
  } catch (error) {
    if (error instanceof StorageNotFoundError) {
      return null;
    }
    throw error;
  }
}
