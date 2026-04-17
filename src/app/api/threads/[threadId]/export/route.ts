import { type NextRequest, NextResponse } from 'next/server';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import {
  getOrgIdFromAuth,
  getCurrentUserId,
  getActiveMember,
  isOrgAdmin,
} from '@/app/lib/utils/auth-helpers';
import { decryptMessageContents } from '@/libs/crypto/decrypt-messages';
import {
  serializeToMarkdown,
  buildExportFilename,
  type ThreadExportData,
} from '@/features/threads/utils/export-thread';
import { ThreadPDF } from '@/features/threads/utils/ThreadPDF';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;

  const format = request.nextUrl.searchParams.get('format');
  if (format !== 'md' && format !== 'pdf') {
    return NextResponse.json(
      { error: 'Invalid format. Use ?format=md or ?format=pdf' },
      { status: 400 },
    );
  }

  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const thread = await db.thread.findFirst({
      where: { id: threadId, organizationId: orgId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        userId: true,
        encryptedDek: true,
        messages: {
          select: { role: true, content: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        threadDocuments: {
          select: {
            userFile: { select: { fileName: true } },
          },
        },
        project: {
          select: { title: true },
        },
      },
    });

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const isOwner = thread.userId === userId;
    if (!isOwner) {
      const member = await getActiveMember(orgId);
      if (!member || !isOrgAdmin(member.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const decryptedMessages = await decryptMessageContents(
      thread.messages,
      thread.encryptedDek,
    );

    const data: ThreadExportData = {
      title: thread.title,
      createdAt: thread.createdAt,
      assistantName: thread.project?.title ?? null,
      messages: decryptedMessages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      sources: thread.threadDocuments.map((td) => ({
        fileName: td.userFile.fileName,
      })),
    };

    const filename = buildExportFilename(
      thread.title,
      thread.createdAt,
      format,
    );

    if (format === 'md') {
      const markdown = serializeToMarkdown(data);
      return new Response(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    const pdfBuffer = await renderToBuffer(createElement(ThreadPDF, { data }));
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error({ err: error, threadId }, 'Failed to export thread');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
