import { MODEL_REGISTRY } from '@ragenai/platform-contracts';

/**
 * The two ways the panel and the proxy can disagree, extracted from the page so
 * they can be tested without rendering.
 *
 * Both come out of the same root cause as the audit that started this work:
 * which models exist is decided by `infra/litellm/config.yaml` at deploy time,
 * while the panel offers what the shared registry marks user-visible. Nothing
 * reconciles the two, and an allowlist that matches nothing does not narrow an
 * organization's model picker — it empties it.
 */

export type OrgModelState = {
  id: string;
  name: string;
  allowedModels: string[];
};

export type UnservedModel = { id: string; label: string };

/**
 * Registry entries a platform administrator can put on an allowlist that this
 * deployment does not serve. Allowing only these strands the organization.
 */
export function findOfferableButUnserved(
  servedModelIds: string[],
): UnservedModel[] {
  const served = new Set(servedModelIds);
  return Object.entries(MODEL_REGISTRY)
    .filter(([id, entry]) => entry.visible && !served.has(id))
    .map(([id, entry]) => ({ id, label: entry.displayName }));
}

/**
 * Organizations whose allowlist matches nothing the proxy serves — their model
 * picker is empty right now.
 *
 * An empty allowlist means "no restriction", not "nothing allowed", so those
 * organizations are fine and must not be reported. That distinction is the
 * whole bug class this page exists to surface.
 */
export function findStrandedOrgs(
  orgs: OrgModelState[],
  servedModelIds: string[],
): { id: string; name: string }[] {
  const served = new Set(servedModelIds);
  return orgs
    .filter(
      (org) =>
        org.allowedModels.length > 0 &&
        !org.allowedModels.some((model) => served.has(model)),
    )
    .map((org) => ({ id: org.id, name: org.name }));
}

/**
 * Whether the configured limit and the proxy's budget have drifted apart.
 * Cents in the database, dollars at the proxy.
 */
export function budgetHasDrifted(
  configuredCents: number | null,
  proxyMaxBudget: number | null,
): boolean {
  const configuredDollars =
    configuredCents == null ? null : configuredCents / 100;
  return configuredDollars !== proxyMaxBudget;
}
