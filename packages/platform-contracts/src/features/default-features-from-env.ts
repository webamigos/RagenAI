import { FEATURE_KEYS, type FeatureKey } from './features';

/**
 * Feature keys an installation switches on from its first boot, without a
 * platform administrator opening the panel.
 *
 * The four layers in `features.ts` have no environment input, which is right
 * for a running installation and wrong for a template that should arrive with
 * a feature on: the Railway template wants Ragen Brain enabled, and the only
 * way to say that was an administrator saving the platform defaults by hand
 * after the first sign-in. The seed (`prisma/seed.ts`, run by `migrate` on
 * every deploy) writes these into the platform-default layer instead.
 *
 * It only ever fills a gap. A key the platform defaults already decide — `true`
 * or `false`, whoever set it — is left alone, so an administrator who turns a
 * feature off is not overruled by the next deploy.
 */
export const DEFAULT_FEATURES_ENV = 'RAGEN_DEFAULT_FEATURES';

/**
 * The comma-separated keys in `raw`, validated against `FEATURE_KEYS`.
 *
 * Throws on an unknown key rather than skipping it: a misspelt key would
 * otherwise do nothing, on every deploy, and nothing would say so.
 */
export function parseDefaultFeatures(raw: string | undefined): FeatureKey[] {
  const names = (raw ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  const known = FEATURE_KEYS as readonly string[];
  const unknown = names.filter((name) => !known.includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `${DEFAULT_FEATURES_ENV} names ${unknown.join(', ')}, not a feature key. ` +
        `Known keys: ${FEATURE_KEYS.join(', ')}`,
    );
  }

  return [...new Set(names)] as FeatureKey[];
}

/**
 * `stored` — the platform defaults as saved, explicit booleans only — with each
 * of `keys` set to `true` where it was not set at all.
 */
export function applyDefaultFeatures(
  stored: Readonly<Record<string, boolean>>,
  keys: readonly FeatureKey[],
): { next: Record<string, boolean>; added: FeatureKey[] } {
  const next = { ...stored };
  const added: FeatureKey[] = [];

  for (const key of keys) {
    if (!(key in next)) {
      next[key] = true;
      added.push(key);
    }
  }

  return { next, added };
}
