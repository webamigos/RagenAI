import { type NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { getStorageProvider } from '@/libs/storage';
import db from '@ragenai/prisma-client';
import type { ChatbotThemeConfig } from '@/features/chatbots/contracts/chatbot.types';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

function buildPublicUrl(key: string): string {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!endpoint || !bucket) {
    throw new Error('AWS_ENDPOINT_URL and AWS_S3_BUCKET_NAME must be set');
  }
  return `${endpoint}/${bucket}/${key}`;
}

function s3KeyFromUrl(url: string): string | null {
  const endpoint = process.env.AWS_ENDPOINT_URL ?? '';
  const bucket = process.env.AWS_S3_BUCKET_NAME ?? '';
  const prefix = `${endpoint}/${bucket}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  const { id } = await params;

  const chatbot = await db.chatbot.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, themeConfig: true },
  });
  if (!chatbot) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ message: 'No file provided' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { message: 'Invalid file type. Allowed: jpeg, png, webp' },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { message: 'File too large. Max 5MB' },
      { status: 400 },
    );
  }

  const storage = getStorageProvider();
  const theme = (chatbot.themeConfig ?? {}) as ChatbotThemeConfig;

  let ext: string;
  if (file.type === 'image/webp') {
    ext = 'webp';
  } else if (file.type === 'image/png') {
    ext = 'png';
  } else {
    ext = 'jpg';
  }
  const key = `chatbot-avatars/${id}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await storage.upload(key, buffer);

  const avatarUrl = buildPublicUrl(key);
  await db.chatbot.update({
    where: { id, organizationId: orgId },
    data: { themeConfig: { ...theme, avatarUrl } },
  });

  if (theme.avatarUrl) {
    const oldKey = s3KeyFromUrl(theme.avatarUrl);
    if (oldKey) {
      await storage.delete(oldKey).catch((err: unknown) => {
        logger.warn(
          { err },
          'Failed to delete old chatbot avatar from storage',
        );
      });
    }
  }

  return NextResponse.json({ avatarUrl });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  const { id } = await params;
  const storage = getStorageProvider();

  const chatbot = await db.chatbot.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, themeConfig: true },
  });
  if (!chatbot) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const theme = (chatbot.themeConfig ?? {}) as ChatbotThemeConfig;

  const { avatarUrl: _removed, ...rest } = theme;
  await db.chatbot.update({
    where: { id, organizationId: orgId },
    data: { themeConfig: rest },
  });

  if (theme.avatarUrl) {
    const key = s3KeyFromUrl(theme.avatarUrl);
    if (key) {
      await storage.delete(key).catch((err: unknown) => {
        logger.warn(
          { err },
          'Failed to delete old chatbot avatar from storage',
        );
      });
    } else {
      logger.warn(
        { avatarUrl: theme.avatarUrl },
        'avatarUrl does not match current S3 prefix, skipping delete',
      );
    }
  }

  return NextResponse.json({ ok: true });
}
