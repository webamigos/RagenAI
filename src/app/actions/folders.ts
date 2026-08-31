'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '../lib/utils/auth-helpers';
import {
  requireOrgAdmin,
  getUserTeamIds,
  getActiveMember,
} from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import { type DocumentFolder, type PiiPolicy } from '@/generated/prisma/client';
import { UnauthorizedException, NotFoundException } from '@/libs/utils/errors';
import db from '@ragenai/prisma-client';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type { DocumentFolderItem } from '@/features/documents/contracts/document.types';
import { type BreadcrumbItem } from '@/features/documents/services/queries/get-folder-breadcrumbs-query';
import { deleteFolderCommand } from '@/features/documents/services/commands/delete-folder-command';
import {
  reembedFolderWithPolicyCommand,
  type ReembedFolderResult,
} from '@/features/documents/services/commands/reembed-folder-with-policy-command';

type OperationResult = { success: true } | { success: false; error: string };

export async function getFolders() {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  return ragenApiRequest<DocumentFolderItem[]>({
    method: 'GET',
    path: '/v1/internal/folders',
    userId,
    orgId,
  });
}

export async function getFolderBreadcrumbs(folderId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  return ragenApiRequest<BreadcrumbItem[]>({
    method: 'GET',
    path: `/v1/internal/folders/${encodeURIComponent(folderId)}/breadcrumbs`,
    userId,
    orgId,
  });
}

export async function createFolder(
  name: string,
  teamId?: string | null,
  parentId?: string | null,
  piiPolicy?: PiiPolicy | null,
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  // Org admins create org-level folders; regular users always create
  // personal folders — this decision never lived in the original
  // create-folder command/apps/api's FoldersService, only here, so it's
  // computed locally and sent explicitly as `ownerId`/`teamId` (apps/api's
  // CreateFolderDto trusts this session-authenticated caller's own
  // already-checked identity, same as elsewhere in this cutover).
  const member = await getActiveMember(orgId).catch(() => null);
  const admin = member ? isOrgAdmin(member.role) : false;
  return ragenApiRequest<DocumentFolder>({
    method: 'POST',
    path: '/v1/internal/folders',
    userId,
    orgId,
    body: {
      name,
      teamId: admin ? (teamId ?? undefined) : undefined,
      parentId: parentId ?? undefined,
      ownerId: admin ? null : userId,
      piiPolicy: piiPolicy ?? undefined,
    },
  });
}

export async function updateFolder(
  folderId: string,
  data: { name?: string; teamId?: string | null; piiPolicy?: PiiPolicy },
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  // Never duplicated into the original update-folder command/apps/api's
  // FoldersService — this authority check only ever lived in this action,
  // so it stays local; only the terminal write is cut over.
  await requireOrgAdmin(orgId);
  return ragenApiRequest<DocumentFolder>({
    method: 'PUT',
    path: `/v1/internal/folders/${encodeURIComponent(folderId)}`,
    userId,
    orgId,
    body: data,
  });
}

/**
 * NOT cut over to apps/api — `deleteFolderCommand` does S3 + vector-store
 * cleanup + audit logging, none of which is ported into apps/api yet
 * (FoldersController has no DELETE route at all). See
 * docs/adrs/21-monorepo-and-api-decoupling.md, documents UI cutover.
 */
export async function deleteFolder(folderId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return deleteFolderCommand(folderId, orgId);
}

export async function moveFileToFolder(
  fileId: string,
  folderId: string | null,
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return ragenApiRequest<OperationResult>({
    method: 'POST',
    path: `/v1/internal/files/${encodeURIComponent(fileId)}/move`,
    userId,
    orgId,
    body: { folderId },
  });
}

export async function moveFolder(folderId: string, newParentId: string | null) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return ragenApiRequest<OperationResult>({
    method: 'POST',
    path: `/v1/internal/folders/${encodeURIComponent(folderId)}/move`,
    userId,
    orgId,
    body: { newParentId },
  });
}

export async function getFolderPiiPolicy(folderId: string): Promise<PiiPolicy> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();

  const folder = await db.documentFolder.findFirst({
    where: { id: folderId, organizationId: orgId },
    select: { ownerId: true, teamId: true },
  });

  if (!folder) {
    throw new NotFoundException('Folder not found');
  }

  const member = await getActiveMember(orgId).catch(() => null);
  const admin = member ? isOrgAdmin(member.role) : false;

  if (!admin) {
    const teamIds = userId ? await getUserTeamIds(orgId, userId) : [];
    const isOrgWide = folder.teamId === null && folder.ownerId === null;
    const isOwner = folder.ownerId !== null && folder.ownerId === userId;
    const isTeamMember =
      folder.teamId !== null && teamIds.includes(folder.teamId);

    if (!isOrgWide && !isOwner && !isTeamMember) {
      throw new UnauthorizedException('Access denied');
    }
  }

  if (!userId) {
    throw new Error('Unauthorized');
  }
  const { piiPolicy } = await ragenApiRequest<{ piiPolicy: PiiPolicy }>({
    method: 'GET',
    path: `/v1/internal/folders/${encodeURIComponent(folderId)}/pii-policy`,
    userId,
    orgId,
  });
  return piiPolicy;
}

export async function updateFolderPiiPolicy(
  folderId: string,
  piiPolicy: PiiPolicy,
): Promise<void> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  // Same "never lived in the command layer" reasoning as updateFolder.
  await requireOrgAdmin(orgId);
  await ragenApiRequest<{ success: boolean }>({
    method: 'PUT',
    path: `/v1/internal/folders/${encodeURIComponent(folderId)}/pii-policy`,
    userId,
    orgId,
    body: { piiPolicy },
  });
}

/**
 * NOT cut over to apps/api — orchestrates Temporal re-embedding workflows,
 * none of which is ported into apps/api yet. See
 * docs/adrs/21-monorepo-and-api-decoupling.md, documents UI cutover.
 */
export async function reembedFolderAction(
  folderId: string,
  piiPolicy: PiiPolicy,
  recursive: boolean = false,
): Promise<ReembedFolderResult> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return reembedFolderWithPolicyCommand(folderId, orgId, piiPolicy, recursive);
}
