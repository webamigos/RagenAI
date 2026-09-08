/**
 * This app's view of the demo tenant's restrictions.
 *
 * The values live in `@ragenai/platform-contracts` (ADR-33) because two
 * writers apply them: the seed script here, once, and `apps/worker`'s nightly
 * cleanup, every run. Until they moved, the worker had no way to restore what
 * a demo visitor with the org-admin role had changed.
 *
 * Still re-exported from here rather than imported from the package at each
 * call site, for the reason this file was created: `apps/web/tsconfig.json`
 * **excludes `src/scripts`**, so the seed script is not typechecked, and a
 * typed module inside the app is what `__tests__/demo-organization.test.ts`
 * checks against the resolver the app will actually run.
 */
export {
  DEMO_FEATURE_OVERRIDES,
  DEMO_MONTHLY_COST_LIMIT_CENTS,
  DEMO_NIGHTLY_RESTORE,
  DEMO_ORGANIZATION_RESTRICTIONS,
} from '@ragenai/platform-contracts';
export type {
  DemoNightlyRestore,
  DemoOrganizationRestrictions,
} from '@ragenai/platform-contracts';
