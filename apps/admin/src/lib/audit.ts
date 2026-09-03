import 'server-only';

import { stripSensitiveFields } from '@ragenai/platform-contracts';
// Same relative reach as `db.ts` — the client is generated into apps/web.
import type { Prisma } from '../../../web/src/generated/prisma/client';

import { prisma } from './db';
import type { AdminUser } from './auth-guard';

/**
 * The record of what a platform administrator did.
 *
 * This panel rendered an Activity Log and wrote to it zero times. Thirty
 * mutating actions — banning a user, granting a paid plan, rewriting an
 * organization's limits — left no trace of who did them or when, which meant a
 * customer asking why their plan changed could not be answered from the
 * database. This module is that trace.
 *
 * ## Where an entry goes, and why there are two places
 *
 * `AuditLog.organizationId` is a **required** column with a foreign key, so it
 * cannot hold an action that belongs to no organization — granting the platform
 * role, editing a platform default. `SecurityEvent.organizationId` is nullable,
 * and its enum already carries two members created for exactly this and never
 * emitted: `AUTH_ADMIN_ROLE_GRANTED` and `ADMIN_SETTINGS_CHANGED`.
 *
 * So the rule is the action's scope, not the author's:
 *
 * - scoped to one organization  → `AuditLog`, beside the app's own entries
 * - scoped to the platform      → `SecurityEvent`
 *
 * An action can be both (changing one org's limits is org-scoped and worth a
 * security event); pass `securityEvent` alongside `organizationId` and it
 * writes both.
 *
 * ## Why this writes to the database directly
 *
 * apps/web exposes `/api/internal/security-events/notify`, which would give us
 * PII scrubbing, severity escalation and e-mail alerting for free. It is
 * deliberately not used here: an audit trail that depends on another service
 * being reachable is an audit trail with gaps, and the gaps appear exactly when
 * something is wrong. The database is shared, so a direct write always
 * succeeds or always fails loudly.
 *
 * What that costs is the alerting, which today has no escalation rule for any
 * admin event type anyway. Routing these through the ingress for alerting is a
 * reasonable follow-up; losing entries is not.
 */

export type AdminAuditInput = {
  /** The administrator, from `requireAdmin()`. */
  admin: AdminUser;
  /** Dotted verb-last name, e.g. `admin.user.role_granted`. */
  action: string;
  /** The kind of thing acted on: `user`, `organization`, `invitation`, … */
  entityType: string;
  entityId?: string | null;
  /** Present when the action belongs to one organization. */
  organizationId?: string | null;
  /** State before and after. Both are redacted before storage. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /**
   * Raise a security event as well. Required when there is no
   * `organizationId`, since `AuditLog` cannot hold such a row.
   */
  securityEvent?: {
    /**
     * `AUTH_ADMIN_ROLE_GRANTED` for the platform role, `ADMIN_USER_ACTION` for
     * anything done to an account, `API_KEY_REVOKED` when a credential stops
     * working, `ADMIN_SETTINGS_CHANGED` for configuration.
     * Keeping a ban out of the "settings changed" bucket is the point — the
     * incidents view filters on this, and a misfiled event is one nobody finds.
     */
    eventType:
      | 'AUTH_ADMIN_ROLE_GRANTED'
      | 'ADMIN_USER_ACTION'
      | 'ADMIN_SETTINGS_CHANGED'
      | 'API_KEY_REVOKED';
    severity?: 'info' | 'warn' | 'critical';
  };
};

/**
 * Every admin action name in one place, so a typo cannot invent a new one that
 * no filter will ever match. The Activity Log's action dropdown is built from
 * `groupBy(['action'])`, so a misspelling silently becomes its own category.
 */
export const ADMIN_ACTIONS = {
  userRenamed: 'admin.user.renamed',
  userBanned: 'admin.user.banned',
  userUnbanned: 'admin.user.unbanned',
  platformRoleGranted: 'admin.user.platform_role_granted',
  platformRoleRevoked: 'admin.user.platform_role_revoked',
  orgRenamed: 'admin.organization.renamed',
  orgSlugChanged: 'admin.organization.slug_changed',
  memberAdded: 'admin.member.added',
  memberRemoved: 'admin.member.removed',
  memberRoleChanged: 'admin.member.role_changed',
  orgLimitsChanged: 'admin.organization.limits_changed',
  orgModelsChanged: 'admin.organization.models_changed',
  orgConnectorsChanged: 'admin.organization.connectors_changed',
  orgTemplatesChanged: 'admin.organization.templates_changed',
  orgRagSettingsChanged: 'admin.organization.rag_settings_changed',
  orgFeaturesChanged: 'admin.organization.features_changed',
  // The six `admin.subscription.*` names are gone with the pages that wrote
  // them. Rows already carrying them stay readable: the Activity Log builds
  // its filter from `groupBy(['action'])` on stored rows, not from this map.
  planFeaturesChanged: 'admin.plan.features_changed',
  plansSynced: 'admin.plan.synced_from_stripe',
  templateCreated: 'admin.assistant_template.created',
  templateUpdated: 'admin.assistant_template.updated',
  templateToggled: 'admin.assistant_template.toggled',
  templateDeleted: 'admin.assistant_template.deleted',
  invitationCanceled: 'admin.invitation.canceled',
  invitationResent: 'admin.invitation.resent',
  apiKeyDeactivated: 'admin.api_key.deactivated',
  apiKeyReactivated: 'admin.api_key.reactivated',
  apiKeyRevoked: 'admin.api_key.revoked',
  connectorForceDisconnected: 'admin.connector.force_disconnected',
  incidentResolved: 'admin.incident.resolved',
  dataExported: 'admin.export.downloaded',
  defaultLimitsChanged: 'admin.defaults.limits_changed',
  defaultModelsChanged: 'admin.defaults.models_changed',
  defaultConnectorsChanged: 'admin.defaults.connectors_changed',
  defaultTemplatesChanged: 'admin.defaults.templates_changed',
  defaultRagSettingsChanged: 'admin.defaults.rag_settings_changed',
  defaultsPropagated: 'admin.defaults.propagated',
  defaultFeaturesChanged: 'admin.defaults.features_changed',
} as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[keyof typeof ADMIN_ACTIONS];

/**
 * Write the entry. Awaited by callers rather than fire-and-forget: apps/web's
 * `trackAudit` swallows failures so the main flow survives, which is right for
 * a customer request and wrong here. If we cannot record that an administrator
 * banned someone, the ban should fail rather than happen invisibly.
 */
export async function recordAdminAction(input: AdminAuditInput): Promise<void> {
  const before = stripSensitiveFields(input.before);
  const after = stripSensitiveFields(input.after);

  if (input.organizationId) {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.admin.id,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        oldData: (before ?? undefined) as Prisma.InputJsonValue | undefined,
        newData: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } else if (!input.securityEvent) {
    // Neither destination applies, which means the caller has an action this
    // module cannot record. Failing here is the point: silence is the bug.
    throw new Error(
      `recordAdminAction("${input.action}") has no organizationId and no securityEvent — nothing would be recorded.`,
    );
  }

  if (input.securityEvent) {
    await prisma.securityEvent.create({
      data: {
        eventType: input.securityEvent.eventType,
        severity: input.securityEvent.severity ?? 'info',
        source: 'admin',
        organizationId: input.organizationId ?? null,
        // The subject of the action when it is a user, so the security view
        // reads "what happened to this account", matching every other event.
        userId: input.entityType === 'user' ? (input.entityId ?? null) : null,
        metadata: {
          actorId: input.admin.id,
          actorEmail: input.admin.email,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          ...(before ? { before } : {}),
          ...(after ? { after } : {}),
        } as Prisma.InputJsonValue,
      },
    });
  }
}
