/**
 * This app's view of the shared feature-flag contract.
 *
 * The contract lives in `@ragenai/platform-contracts` (ADR-33). Both consumers
 * here — the per-organization override form and the per-plan features dialog —
 * import from this module, so `Record<FeatureKey, string>` stays the reminder
 * that every key is named.
 */
export {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  FEATURE_LABELS,
  FEATURE_SOURCE_LABELS,
  PLATFORM_FEATURE_DEFAULTS_KEY,
  resolveFeatures,
  sanitizeFeatureOverrides,
} from '@ragenai/platform-contracts';

export type {
  FeatureKey,
  FeatureOverrides,
  FeatureResolution,
  FeatureSource,
  PlatformFeatureDefaults,
} from '@ragenai/platform-contracts';
