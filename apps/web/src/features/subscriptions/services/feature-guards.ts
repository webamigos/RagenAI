import 'server-only';

import { UnauthorizedException } from '@/libs/utils/errors';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

/**
 * Assertions for the write-restriction flags, so the same rule is not written
 * out at each of the dozen places that can change an organization's content.
 *
 * These gates exist because upload and delete are not funnelled through one
 * chokepoint: a document can arrive through the UI upload route, the internal
 * single-file route, a scraped URL, the markdown creator or a Google Drive
 * import, and each of those reaches a different command. Repeating
 * `isFeatureEnabledQuery(...) + throw` at every one of them is how the
 * messages drift and how one path gets forgotten — which is the failure this
 * whole family of contracts exists to prevent (ADR-33).
 *
 * **These cover apps/web only.** `apps/api` is not a proxy to this app; per
 * ADR-21 it holds its own ported copies of the same write paths and gates
 * them with `SubscriptionsService.isFeatureEnabled`. A gate added here does
 * nothing for the public API, and vice versa.
 *
 * The message matters: it is what an operator sees when a demo visitor tries
 * to upload, so it says the organization is restricted rather than implying
 * the user lacks a role or the plan lacks a feature.
 */
async function assertFeatureEnabled(
  organizationId: string,
  feature: Parameters<typeof isFeatureEnabledQuery>[1],
  message: string,
): Promise<void> {
  if (!(await isFeatureEnabledQuery(organizationId, feature))) {
    throw new UnauthorizedException(message);
  }
}

/** Adding, replacing or removing anything in the knowledge base. */
export async function assertCanManageDocuments(
  organizationId: string,
): Promise<void> {
  await assertFeatureEnabled(
    organizationId,
    'manageDocuments',
    'This organization cannot add or remove documents',
  );
}

/** Creating or deleting a project, which takes its documents with it. */
export async function assertCanManageProjects(
  organizationId: string,
): Promise<void> {
  await assertFeatureEnabled(
    organizationId,
    'manageProjects',
    'This organization cannot create or delete projects',
  );
}

/** Changing organization-level configuration. */
export async function assertCanManageOrganizationSettings(
  organizationId: string,
): Promise<void> {
  await assertFeatureEnabled(
    organizationId,
    'manageOrganizationSettings',
    'This organization cannot change its settings',
  );
}
