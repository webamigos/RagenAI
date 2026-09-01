import type { SettingsPage, SettingsVisibility } from './registry';

export type SettingsAccessContext = {
  isAppAdmin: boolean;
  isOrgAdmin: boolean;
  isOrgOwner: boolean;
  featureFlags?: Readonly<Record<string, boolean>>;
};

export function canAccessSettingsPage(
  visibility: SettingsVisibility,
  ctx: SettingsAccessContext,
): boolean {
  if (visibility.featureFlag) {
    const enabled = ctx.featureFlags?.[visibility.featureFlag] ?? false;
    if (!enabled) {
      return false;
    }
  }

  const role = visibility.requireRole ?? 'user';
  switch (role) {
    case 'user':
      return true;
    case 'orgAdmin':
      return ctx.isAppAdmin || ctx.isOrgAdmin;
    case 'orgOwner':
      return ctx.isAppAdmin || ctx.isOrgOwner;
    case 'appAdmin':
      return ctx.isAppAdmin;
  }
}

export function filterSettingsPages(
  registry: readonly SettingsPage[],
  ctx: SettingsAccessContext,
): SettingsPage[] {
  return registry
    .filter((page) => canAccessSettingsPage(page.visibility, ctx))
    .sort((a, b) => a.order - b.order);
}
