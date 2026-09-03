/**
 * This app's view of the shared feature-flag contract.
 *
 * The contract lives in `@ragenai/platform-contracts` (ADR-33). This file was
 * a hand-maintained port of ragen-app's `features.types.ts`; a key missing
 * here left that flag ungated on the public API path while it stayed gated
 * in-app, which is the kind of divergence no test in either app could see.
 */
export {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  FEATURE_LABELS,
  sanitizeFeatureOverrides,
} from '@ragenai/platform-contracts';

export type {
  FeatureFlags,
  FeatureKey,
  FeatureOverrides,
} from '@ragenai/platform-contracts';
