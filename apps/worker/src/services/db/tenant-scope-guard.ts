import {
  isTenantScopeSatisfied,
  type TenantScopeViolation,
} from '@ragenai/platform-contracts';

import { Prisma } from '../../../generated/prisma';

/**
 * This app's binding of the shared tenant-scope guard — the third one, after
 * apps/web's and apps/api's.
 *
 * The model map and the predicate live in `@ragenai/platform-contracts`
 * (ADR-33), so they are not restated here. What cannot move is
 * `Prisma.defineExtension`: it needs *this app's* generated client, which is
 * the whole reason each app carries a file like this instead of the package
 * exporting a ready-made extension.
 *
 * Why the worker gets one at all: it has no tripwire today. Every one of the
 * 27 functions in `services/db/db.ts` filters by `organization_id` correctly,
 * so this is not fixing a leak — it is closing the asymmetry that apps/web and
 * apps/api have a runtime check saying so and the worker has hand-written
 * `where` clauses and a hope. See [ADR-40](../../../../../docs/adrs/40-worker-uses-prisma-not-knex.md).
 */
export {
  TENANT_SCOPED_MODELS,
  isTenantScopeSatisfied,
} from '@ragenai/platform-contracts';
export type { TenantScopeViolation } from '@ragenai/platform-contracts';

/**
 * Warn-only Prisma Client Extension: logs every query on a tenant-scoped model
 * that is missing its org filter, and never blocks it.
 *
 * Warn-only on purpose, and for the same reason as the other two apps: turning
 * it into a throw means auditing every existing call site first, which is its
 * own piece of work and not a side effect of a migration.
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
