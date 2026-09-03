/**
 * This app's view of the shared feature-flag contract.
 *
 * The contract lives in `@ragenai/platform-contracts` (ADR-33) because
 * apps/api gates the same flags on the public API path and apps/admin writes
 * the per-organization overrides. All three kept their own copy of this file
 * until then, and typecheck could not see them drift — each derived its own
 * `FeatureKey` union from its own array.
 */
export {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  FEATURE_LABELS,
  FEATURE_SOURCE_LABELS,
  PLATFORM_FEATURE_DEFAULTS_KEY,
  flattenFeatures,
  resolveFeatures,
  sanitizeFeatureOverrides,
} from '@ragenai/platform-contracts';

export type {
  FeatureFlags,
  FeatureKey,
  FeatureOverrides,
  FeatureResolution,
  FeatureSource,
  PlatformFeatureDefaults,
} from '@ragenai/platform-contracts';
