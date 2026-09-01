'use server';

import db from '@ragenai/prisma-client';
import type { UserDocument } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
  decryptThreadKey,
} from '@/libs/crypto/thread-encryption';

export const updateDocumentTitleCommand = async ({
  orgId,
  documentId,
  title,
}: {
  orgId: string;
  documentId: string;
  title?: string;
}) => {
  await db.userDocument.updateMany({
    where: {
      organizationId: orgId,
      id: documentId,
    },
    data: {
      title,
      updatedAt: new Date(),
    },
  });
};

export const updateDocumentContentCommand = async ({
  orgId,
  documentId,
  content,
}: {
  orgId: string;
  documentId: string;
  content?: string;
}) => {
  if (!content) {
    await db.userDocument.updateMany({
      where: { organizationId: orgId, id: documentId },
      data: { content, encryptedDek: null, updatedAt: new Date() },
    });
    return;
  }

  let encryptedContent = content;
  let encryptedDek: string | undefined;

  if (isEncryptionEnabled()) {
    // Check if document already has a DEK
    const existing = await db.userDocument.findFirst({
      where: { organizationId: orgId, id: documentId },
      select: { encryptedDek: true },
    });

    let dek: Buffer;
    if (existing?.encryptedDek) {
      // Reuse existing DEK
      dek = await decryptThreadKey(existing.encryptedDek);
    } else {
      // Generate new DEK
      const key = await generateThreadKey();
      dek = key.plaintextDek;
      encryptedDek = key.encryptedDek;
    }

    encryptedContent = encryptContent(content, dek);
  }

  await db.userDocument.updateMany({
    where: { organizationId: orgId, id: documentId },
    data: {
      content: encryptedContent,
      ...(encryptedDek ? { encryptedDek } : {}),
      updatedAt: new Date(),
    },
  });
};

export const deleteDocumentFromDbCommand = async (
  documentId: UserDocument['id'],
) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userDocument.deleteMany({
    where: {
      id: documentId,
      organizationId: orgId,
    },
  });
};
