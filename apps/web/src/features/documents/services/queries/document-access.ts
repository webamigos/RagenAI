import type { OrgVisibilityScope } from '@ragenai/platform-contracts';

import type { Prisma } from '@/generated/prisma/client';

/**
 * Who is asking, for the purpose of reaching a document.
 *
 * `scope` is derived from the *organization* role (`Member.role`), never
 * `User.role` — a platform admin has no implicit claim on a tenant's
 * documents.
 *
 * It is a scope rather than an `isOrgAdmin` boolean because those were two
 * questions wearing one answer: "may administer the organization" and "may see
 * every row in it" (ADR-39). Only the second one belongs here, and a value
 * leaves room for the third answer a team-scoped role would need without
 * every caller re-deciding what a boolean meant.
 */
export type DocumentActor = {
  userId: string | null;
  teamIds: string[];
  scope: OrgVisibilityScope;
};

/**
 * The single definition of "which files may this actor read".
 *
 * Every path that reaches a file — the knowledge-base listing, the assistant's
 * picker, and each by-id route — composes this rather than restating it. The
 * restating is what went wrong before: the listing filtered correctly while
 * `/api/files/[fileId]` and its neighbours checked only `organizationId`, so
 * any member could read any file in their own org by id. Two predicates that
 * are supposed to agree will eventually not.
 *
 * Returns `{}` for the `'organization'` scope (everything in the org) and an
 * `OR` otherwise. Callers must still apply `organizationId` themselves — this
 * says nothing about tenancy, and the two checks are separate on purpose.
 *
 * Deliberately pure, and deliberately free of any auth or session import: it
 * is reached from queries that component tests render under jsdom, and pulling
 * the session stack in here made those fail on an unrelated module. Resolving
 * an actor from the session lives in `get-document-actor.ts`.
 */
export function fileAccessWhere(
  actor: DocumentActor,
): Prisma.UserFileWhereInput {
  if (actor.scope === 'organization') {
    return {};
  }

  // A non-member reaches nothing, including the unowned files below. That arm
  // is a deliberate allowance for content that predates ownership — org-wide
  // *within the org* — and an actor with no membership row is not within it.
  // `id: { in: [] }` rather than an empty `OR`, whose emptiness is easy to
  // read as "no restriction" at a glance.
  if (actor.scope === 'none') {
    return { id: { in: [] } };
  }

  const { userId, teamIds } = actor;
  const hasTeams = teamIds.length > 0;

  return {
    OR: [
      // Files predating ownership. Treated as org-wide, which is the existing
      // behaviour — narrowing it would hide documents people rely on.
      { ownerId: null },
      ...(userId ? [{ ownerId: userId }] : []),
      // Bound to a team through the folder itself.
      ...(hasTeams ? [{ folder: { teamId: { in: teamIds } } }] : []),
      // Granted on the file.
      ...(userId
        ? [
            {
              permissions: { some: { granteeType: 'user', granteeId: userId } },
            },
          ]
        : []),
      ...(hasTeams
        ? [
            {
              permissions: {
                some: { granteeType: 'team', granteeId: { in: teamIds } },
              },
            },
          ]
        : []),
      // Granted on the containing folder. Inherited rather than copied onto
      // each file, so this arm is what makes a folder share mean anything.
      ...(userId
        ? [
            {
              folder: {
                permissions: {
                  some: { granteeType: 'user', granteeId: userId },
                },
              },
            },
          ]
        : []),
      ...(hasTeams
        ? [
            {
              folder: {
                permissions: {
                  some: { granteeType: 'team', granteeId: { in: teamIds } },
                },
              },
            },
          ]
        : []),
    ],
  };
}
