import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Fixtures, shared with apps/web's seed rather than duplicated.
 *
 * `apps/web/e2e/seed/e2e-seed.ts` already creates both accounts this suite
 * needs: one with `role: 'admin'` — the platform role the panel checks — and
 * one ordinary `role: 'user'`, which is what makes the refusal test possible
 * without inventing an account here.
 */

export const AUTH_FILE = path.join(__dirname, '.auth', 'admin.json');

/** Platform administrator. `users.role = 'admin'` in the seed. */
export const ADMIN_EMAIL = process.env.TEST_USER_EMAIL ?? 'e2e-test@ragen.ai';
export const ADMIN_PASSWORD =
  process.env.TEST_USER_PASSWORD ?? 'E2eTestPassword123!';
export const ADMIN_USER_ID = 'e2e-test-user-0000-0000-0001';

/** An ordinary customer. Must be refused by the panel. */
export const CUSTOMER_EMAIL = 'e2e-other@ragen.ai';
// Not the same as the administrator's. Sharing one would let a mistyped
// constant turn "refused for lacking the role" into "refused for a bad
// password" without the test noticing.
export const CUSTOMER_PASSWORD = 'E2eOtherPassword123!';
export const CUSTOMER_USER_ID = 'e2e-test-user-0000-0000-0002';

export const TEST_ORG_ID = 'e2e-test-org-00000-0000-0001';
export const TEST_ORG_NAME = "E2E Test User's Organization";

/** Every page the sidebar links to, so a rename breaks a test not a user. */
export const ROUTES = {
  login: '/login',
  dashboard: '/',
  users: '/users',
  organizations: '/organizations',
  invitations: '/invitations',
  features: '/features',
  plans: '/features/plans',
  limits: '/limits',
  models: '/models',
  connectors: '/connectors',
  connectorHealth: '/connector-health',
  ragSettings: '/rag-settings',
  assistantTemplates: '/assistant-templates',
  templateAccess: '/template-access',
  apiKeys: '/api-keys',
  defaults: '/defaults',
  proxy: '/proxy',
  aiUsage: '/ai-usage',
  diskUsage: '/disk-usage',
  activityLog: '/activity-log',
  incidents: '/incidents',
} as const;
