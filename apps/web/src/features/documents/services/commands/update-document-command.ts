'use server';

import db from '@ragenai/prisma-client';
import type { UserDocument } from '@/generated/prisma/client';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
  decryptThreadKey,
  assertEncryptionAvailable,
} from '@ragenai/crypto';
import { createDocumentVersionCommand } from './create-document-version-command';

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
  authorId = null,
}: {
  orgId: string;
  documentId: string;
  content?: string;
  authorId?: string | null;
}) => {
  const encrypt = isEncryptionEnabled();

  // Before the empty-content branch below, not inside the encrypting one: a
  // blank update still writes the `content` column and clears `encryptedDek`,
  // so a deployment that must encrypt has to refuse it too.
  if (!encrypt) {
    assertEncryptionAvailable();
  }

  if (!content) {
    await db.userDocument.updateMany({
      where: { organizationId: orgId, id: documentId },
      data: { content, encryptedDek: null, updatedAt: new Date() },
    });
    return;
  }

  let encryptedContent = content;
  let encryptedDek: string | undefined;

  if (encrypt) {
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

  if (content) {
    const doc = await db.userDocument.findFirst({
      where: { organizationId: orgId, id: documentId },
      select: { title: true },
    });
    if (doc) {
      await createDocumentVersionCommand({
        documentId,
        organizationId: orgId,
        content,
        title: doc.title,
        changeType: 'MANUAL',
        authorId,
      });
    }
  }
};

/**
 * `organizationId` is a required argument rather than read from the session.
 *
 * Both callers are cleanup steps inside a delete that was already authorized,
 * and they already hold a validated org id. One of them — `deleteFileCommand`,
 * via the internal `/api/v1/files/[fileId]` route — runs with no session at
 * all, where reading it threw, the caller's `catch` logged a warning, and the
 * `UserDocument` row was silently orphaned.
 */
export const deleteDocumentFromDbCommand = async (
  documentId: UserDocument['id'],
  organizationId: string,
) => {
  return await db.userDocument.deleteMany({
    where: {
      id: documentId,
      organizationId,
    },
  });
};
