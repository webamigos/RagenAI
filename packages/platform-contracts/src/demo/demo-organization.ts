import type { FeatureOverrides } from '../features/features';

/**
 * What makes an organization the demo showcase tenant.
 *
 * Two writers have to agree on this, which is why it lives here rather than in
 * either of them (ADR-33): `apps/web`'s `seed-demo-organization` script applies
 * it once, and `apps/worker`'s nightly `cleanupDemoThreads` workflow re-applies
 * it every run, so a visitor with the org-admin role — the shared demo account
 * has it — cannot leave the tenant writable for longer than a night. The spec
 * lists "someone clears the flags on the demo org" as a failure mode with no
 * lock; the nightly re-apply is the lock.
 *
 * Chat is deliberately absent. A demo that cannot hold a conversation is not a
 * demo — the point is that chat works while the corpus and the configuration
 * stay frozen (docs/specs/2026-09-06-demo-environment.md, "Decisions taken up
 * front").
 *
 * `as const satisfies FeatureOverrides` is what catches a misspelled key:
 * `featureOverrides` is an untyped JSON column and `sanitizeFeatureOverrides`
 * drops any key it does not recognise, so a typo would write a row that looks
 * right and leave the demo tenant writable.
 */
export const DEMO_FEATURE_OVERRIDES = {
  /** The three Phase B write restrictions — the reason this list exists. */
  manageDocuments: false,
  manageProjects: false,
  manageOrganizationSettings: false,

  /** A shared account should not be able to grow itself more accounts. */
  inviteMembers: false,

  /**
   * A prospect wiring their own Google or Slack into a shared demo account
   * would be granting a stranger's session access to their data.
   */
  mcpConnectors: false,

  /** API keys minted here outlive the demo and are not revocable per visitor. */
  apiAccess: false,
} as const satisfies FeatureOverrides;

/**
 * The spend cap, in cents, synced to the organization's LiteLLM team budget by
 * `apps/web`'s `syncLiteLLMTeamBudgetCommand`.
 *
 * Placeholder — set a real figure before the demo is handed out. This is the
 * only backstop against a scripted visitor: with one shared account there is
 * no per-visitor rate limit to fall back on (spec, "Failure modes").
 */
export const DEMO_MONTHLY_COST_LIMIT_CENTS = 5_000;

/**
 * What the seed writes when it first converts an organization into the demo
 * tenant. Both values, because at that point the row has neither.
 */
export const DEMO_ORGANIZATION_RESTRICTIONS = {
  featureOverrides: DEMO_FEATURE_OVERRIDES,
  monthlyCostLimitCents: DEMO_MONTHLY_COST_LIMIT_CENTS,
} as const;

/**
 * What the nightly job puts back: the feature flags, and **not** the spend
 * cap.
 *
 * The job exists because the shared demo account holds the org-admin role and
 * can clear the flags. It cannot touch `monthlyCostLimitCents` — that is set
 * from the admin panel, which a demo visitor cannot reach — so the cap needs
 * no restoring, and restoring it does active harm: `DEMO_MONTHLY_COST_LIMIT_CENTS`
 * is a placeholder, and the demo deployment already runs on an operator's
 * deliberate 1000. Writing the constant back would have raised the month's
 * budget fivefold on an account strangers use, on the first night the
 * schedule ran.
 *
 * The general rule, worth stating because the next value added here will face
 * it: a nightly restore may only own settings the thing it defends against can
 * change. Everything else belongs to whoever set it.
 */
export const DEMO_NIGHTLY_RESTORE = {
  featureOverrides: DEMO_FEATURE_OVERRIDES,
} as const;

export type DemoOrganizationRestrictions = {
  featureOverrides: FeatureOverrides;
  monthlyCostLimitCents: number;
};

export type DemoNightlyRestore = {
  featureOverrides: FeatureOverrides;
};
