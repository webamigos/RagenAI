/**
 * PII masking, which is off unless an install asks for it.
 *
 * Presidio is two containers behind compose's `pii` profile, and the analyzer
 * alone is the largest single memory consumer in the stack — 959 MB idle,
 * more than Docling. So "everyone gets it" would nearly double the machine a
 * trial install needs, for a feature most evaluations do not exercise.
 *
 * **Availability follows the two URLs**, not a flag: `@ragenai/env`'s
 * `isPiiMaskingConfigured()` reads them, and `FEATURE_FLAG_PII_MASKING=1` no
 * longer turns anything on. So declining writes nothing and masking is off by
 * construction — there is no "enabled but unconfigured" state for this wizard
 * to create.
 */

export const PRESIDIO_ANALYZER_URL = 'http://localhost:5002';
export const PRESIDIO_ANONYMIZER_URL = 'http://localhost:5003';

/** The compose profile the two services sit behind. */
export const PII_COMPOSE_PROFILE = 'pii';

export interface PiiMaskingSelection {
  enabled: boolean;
  envUpdates: Record<string, string>;
  /** Passed to `docker compose --profile …`, so choosing it starts it. */
  composeProfiles: string[];
}

export function resolvePiiMaskingSelection(
  enabled: boolean,
): PiiMaskingSelection {
  if (!enabled) {
    return { enabled: false, envUpdates: {}, composeProfiles: [] };
  }

  return {
    enabled: true,
    envUpdates: {
      PRESIDIO_ANALYZER_URL,
      PRESIDIO_ANONYMIZER_URL,
    },
    composeProfiles: [PII_COMPOSE_PROFILE],
  };
}
