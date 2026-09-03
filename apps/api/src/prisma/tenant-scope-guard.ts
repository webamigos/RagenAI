import { Prisma } from '../generated/prisma/client.js';
import {
  isTenantScopeSatisfied,
  type TenantScopeViolation,
} from '@ragenai/platform-contracts';

/**
 * This app's binding of the shared tenant-scope guard.
 *
 * The model map and the predicate live in `@ragenai/platform-contracts`
 * (ADR-33). This file was previously a hand-maintained mirror of apps/web's,
 * identical but for the import, the logger and the comments — and the model map
 * was the half that actually had to stay in sync. What remains here is the part
 * that genuinely cannot move: `Prisma.defineExtension` needs *this app's*
 * generated client. See apps/api/AGENTS.md's "Database (Prisma)" section.
 */
export {
  TENANT_SCOPED_MODELS,
  isTenantScopeSatisfied,
} from '@ragenai/platform-contracts';
export type { TenantScopeViolation } from '@ragenai/platform-contracts';

/**
 * Warn-only Prisma Client Extension: logs every query on a tenant-scoped
 * model that's missing its org filter, but never blocks the query. This is
 * deliberately not an enforcement mechanism yet — see apps/api/AGENTS.md's
 * "Database (Prisma)" section for why (a repo-wide grep found ~200 existing
 * call sites across both apps; auditing all of them before enabling a hard
 * throw is future work, not part of shipping this guard).
 */
export function createTenantScopeWarnExtension(
  onViolation: (violation: TenantScopeViolation) => void,
) {
  return Prisma.defineExtension({
    name: 'tenant-scope-warn',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (isTenantScopeSatisfied(model, operation, args) === false) {
            onViolation({ model, operation });
          }
          return query(args);
        },
      },
    },
  });
}
