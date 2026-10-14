type Env = NodeJS.ProcessEnv;

/**
 * Whether this deployment has a basal server to ask.
 *
 * The URL is the whole switch, the way `isPiiMaskingConfigured` reads
 * Presidio's: there is no `FEATURE_FLAG_BASAL`, because a flag and a URL are
 * two sources of truth that drift. Whether an organization *uses* basal is a
 * feature key resolved per organization, and answers a different question.
 */
export function isBasalConfigured(env: Env = process.env): boolean {
  const url = env.BASAL_URL;
  return typeof url === 'string' && url.trim() !== '';
}
