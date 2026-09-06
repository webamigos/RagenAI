import type { FeatureOverrides } from '@/features/subscriptions/contracts/features.types';

/**
 * What makes an organization the demo showcase tenant.
 *
 * These live here rather than beside the seed script that applies them
 * (`src/scripts/seed-demo-organization.ts`) for one concrete reason:
 * `apps/web/tsconfig.json` **excludes `src/scripts`**, so nothing in that
 * directory is typechecked. A `FeatureOverrides` typo there would compile,
 * write, and silently do nothing — `sanitizeFeatureOverrides` drops keys it
 * does not recognise, so the demo tenant would keep the capability the
 * override was meant to remove, and the admin panel would not show the
 * difference either, because it renders only known keys.
 *
 * Typed and tested here; imported there.
 *
 * Chat is deliberately absent from this list. A demo that cannot hold a
 * conversation is not a demo — the point is that chat works while the corpus
 * and the configuration stay frozen (spec, "Decisions taken up front").
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
 * `syncLiteLLMTeamBudgetCommand`.
 *
 * Placeholder — set a real figure before the demo is handed out. This is the
 * only backstop against a scripted visitor: with one shared account there is
 * no per-visitor rate limit to fall back on (spec, "Failure modes").
 */
export const DEMO_MONTHLY_COST_LIMIT_CENTS = 5_000;
