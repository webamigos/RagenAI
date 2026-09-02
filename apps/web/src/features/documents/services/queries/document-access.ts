import type { Prisma } from '@/generated/prisma/client';

/**
 * Who is asking, for the purpose of reaching a document.
 *
 * `isOrgAdmin` is the *organization* role (`Member.role`), never `User.role` —
 * a platform admin has no implicit claim on a tenant's documents.
 */
export type DocumentActor = {
  userId: string | null;
  teamIds: string[];
  isOrgAdmin: boolean;
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
 * Returns `{}` for an org admin (everything in the org) and an `OR` otherwise.
 * Callers must still apply `organizationId` themselves — this says nothing
 * about tenancy, and the two checks are separate on purpose.
 *
 * Deliberately pure, and deliberately free of any auth or session import: it
 * is reached from queries that component tests render under jsdom, and pulling
 * the session stack in here made those fail on an unrelated module. Resolving
 * an actor from the session lives in `get-document-actor.ts`.
 */
export function fileAccessWhere(
  actor: DocumentActor,
): Prisma.UserFileWhereInput {
  if (actor.isOrgAdmin) {
    return {};
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
