import {
  DEFAULT_INSTANCE_PALETTE,
  DEFAULT_PRODUCT_NAME,
  type InstancePalette,
} from '@ragenai/platform-contracts';

export {
  DEFAULT_INSTANCE_PALETTE,
  DEFAULT_PRODUCT_NAME,
  INSTANCE_PALETTES,
  PRODUCT_NAME_MAX_LENGTH,
  checkLogo,
  isInstancePalette,
} from '@ragenai/platform-contracts';
export type { InstancePalette } from '@ragenai/platform-contracts';

/**
 * What the panel, the page titles and the emails render.
 *
 * Resolved, never partial: a field the operator left empty is already its
 * default here, so no caller has to know what the default is. That is also
 * why it crosses to the client as is — it holds nothing an anonymous visitor
 * of the sign-in page should not see.
 */
export type InstanceBranding = {
  productName: string;
  /**
   * Same-origin and versioned (`?v=<updatedAt>`), so the browser may cache it
   * for good and a new upload is a new URL. Null: no logo was uploaded.
   */
  logoUrl: string | null;
  palette: InstancePalette;
  /** False exactly when every field is its default — today's Ragen branding. */
  isCustom: boolean;
};

export const DEFAULT_INSTANCE_BRANDING: InstanceBranding = {
  productName: DEFAULT_PRODUCT_NAME,
  logoUrl: null,
  palette: DEFAULT_INSTANCE_PALETTE,
  isCustom: false,
};

/** The stored row, as the query reads it. */
export type InstanceBrandingRow = {
  productName: string | null;
  logoStorageKey: string | null;
  primaryToken: string | null;
  updatedAt: Date;
};

/** What an email needs: the same, with a logo URL a mail client can fetch. */
export type EmailBranding = {
  productName: string;
  /** Absolute. Null: the default Ragen logo, or the name as text. */
  logoUrl: string | null;
  isCustom: boolean;
};

export type UpdateInstanceBrandingInput = {
  productName: unknown;
  palette: unknown;
  removeLogo: unknown;
  /** The uploaded file's bytes, or null when the logo is left as it is. */
  logo: Uint8Array | null;
};

/** What is stored after a save, for the caller's audit entry. */
export type StoredInstanceBranding = {
  productName: string | null;
  palette: InstancePalette;
  hasLogo: boolean;
};

export type UpdateInstanceBrandingResult =
  | { ok: true; before: StoredInstanceBranding; after: StoredInstanceBranding }
  | { ok: false; reason: string };
