import { Prisma } from '@/generated/prisma/client';
import {
  isTenantScopeSatisfied,
  type TenantScopeViolation,
} from '@ragenai/platform-contracts';

/**
 * This app's binding of the shared tenant-scope guard.
 *
 * The model map and the predicate live in `@ragenai/platform-contracts`
 * (ADR-33) — they are the half that has to agree with apps/api, and the half
 * with no Prisma dependency. What cannot move is the extension below: it needs
 * `Prisma.defineExtension` from *this app's* generated client. See
 * `TENANT_SCOPED_MODELS` in the package for which models are covered and, more
 * importantly, which are not.
 */
export {
  TENANT_SCOPED_MODELS,
  isTenantScopeSatisfied,
} from '@ragenai/platform-contracts';
export type { TenantScopeViolation } from '@ragenai/platform-contracts';

type QueryArgs = Record<string, unknown>;

/**
 * Warn-only Prisma Client Extension: logs every query on a tenant-scoped
 * model that's missing its org filter, but never blocks the query. This is
 * deliberately not an enforcement mechanism yet — see AGENTS.md's "Prisma
 * (v7)" section for why (a repo-wide grep found ~200 existing call sites
 * across both apps; auditing all of them before enabling a hard throw is
 * future work, not part of shipping this guard).
 */
export function createTenantScopeWarnExtension(
  onViolation: (violation: TenantScopeViolation) => void,
) {
  return Prisma.defineExtension({
    name: 'tenant-scope-warn',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (
            isTenantScopeSatisfied(model, operation, args as QueryArgs) ===
            false
          ) {
            onViolation({ model, operation });
          }
          return query(args);
        },
      },
    },
  });
}
