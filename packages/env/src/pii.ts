type Env = NodeJS.ProcessEnv;

const isSet = (value: string | undefined): boolean =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Whether this deployment has somewhere to send text for PII masking.
 *
 * Both halves, because masking needs both: the analyzer finds entities and the
 * anonymizer replaces them. One without the other is not a degraded mode, it
 * is a request that fails halfway.
 *
 * This replaced `FEATURE_FLAG_PII_MASKING === '1'` as the thing that decides
 * whether the feature exists, because a flag and a URL are two sources of
 * truth that drift in both directions: a flag with no URL is a fail-open on
 * every message, and a URL with no flag is two containers nothing calls. The
 * configuration is the one an operator cannot forget to keep in step with
 * itself.
 */
export function isPiiMaskingConfigured(env: Env = process.env): boolean {
  return isSet(env.PRESIDIO_ANALYZER_URL) && isSet(env.PRESIDIO_ANONYMIZER_URL);
}

/**
 * Whether to mask. Configured, and not switched off.
 *
 * `FEATURE_FLAG_PII_MASKING=0` is the kill switch — for turning masking off
 * during an incident without tearing the URLs out of a deployment and losing
 * them. Any other value, including unset, leaves a configured deployment
 * masking.
 */
export function isPiiMaskingEnabled(env: Env = process.env): boolean {
  return isPiiMaskingConfigured(env) && env.FEATURE_FLAG_PII_MASKING !== '0';
}

/**
 * Someone asked for masking and gave it nowhere to run.
 *
 * Its own predicate rather than a branch inside the one above, because the two
 * answer different questions and only this one is worth a boot-time error.
 * `FEATURE_FLAG_PII_MASKING=1` used to be the whole switch, so a deployment
 * upgrading from that spelling — with the URLs left to their old built-in
 * defaults — would otherwise stop masking in silence. Silence is the wrong
 * outcome for a security control being turned off by an upgrade.
 */
export function isPiiMaskingMisconfigured(env: Env = process.env): boolean {
  return env.FEATURE_FLAG_PII_MASKING === '1' && !isPiiMaskingConfigured(env);
}

/** What to tell an operator who hit the case above. */
export const PII_MASKING_MISCONFIGURED_MESSAGE =
  'FEATURE_FLAG_PII_MASKING=1 asks for PII masking, but neither ' +
  'PRESIDIO_ANALYZER_URL nor PRESIDIO_ANONYMIZER_URL is set, so nothing is ' +
  'masked. Availability now follows those two URLs; the flag only switches a ' +
  'configured deployment off (=0). Set both URLs, or drop the flag.';
