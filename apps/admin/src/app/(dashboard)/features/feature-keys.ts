/**
 * This app's view of the shared feature-flag contract.
 *
 * The contract lives in `@ragenai/platform-contracts` (ADR-33). Both consumers
 * here — the per-organization override form and the per-plan features dialog —
 * import from this module, so `Record<FeatureKey, string>` stays the reminder
 * that every key is named.
 */
export { FEATURE_KEYS, FEATURE_LABELS } from '@ragenai/platform-contracts';

export type { FeatureKey, FeatureOverrides } from '@ragenai/platform-contracts';
