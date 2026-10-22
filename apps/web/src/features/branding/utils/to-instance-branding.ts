import {
  DEFAULT_INSTANCE_BRANDING,
  DEFAULT_INSTANCE_PALETTE,
  DEFAULT_PRODUCT_NAME,
  isInstancePalette,
  type InstanceBranding,
  type InstanceBrandingRow,
} from '../contracts/branding.types';
import { LOGO_ROUTE } from '../constants';

/**
 * The stored row as the panel renders it, with every gap filled by its
 * default.
 *
 * Forgiving on purpose: a palette id from a newer release, or a name that is
 * only whitespace, falls back to the default for that one field rather than
 * failing the whole render. Branding is decoration; a page that cannot draw
 * it must still draw.
 */
export function toInstanceBranding(
  row: InstanceBrandingRow | null,
): InstanceBranding {
  if (!row) {
    return DEFAULT_INSTANCE_BRANDING;
  }

  const productName = row.productName?.trim() || DEFAULT_PRODUCT_NAME;
  const palette = isInstancePalette(row.primaryToken)
    ? row.primaryToken
    : DEFAULT_INSTANCE_PALETTE;
  const logoUrl = row.logoStorageKey
    ? `${LOGO_ROUTE}?v=${row.updatedAt.getTime()}`
    : null;

  return {
    productName,
    logoUrl,
    palette,
    isCustom:
      productName !== DEFAULT_PRODUCT_NAME ||
      logoUrl !== null ||
      palette !== DEFAULT_INSTANCE_PALETTE,
  };
}
