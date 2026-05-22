import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: vi.fn().mockResolvedValue('org-1'),
}));
vi.mock('@/lib/auth-guards', () => ({
  requireOrgAdmin: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    chatbot: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('@/libs/storage', () => ({
  getStorageProvider: vi.fn().mockReturnValue({
    upload: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import db from '@ragenai/prisma-client';
import { getStorageProvider } from '@/libs/storage';
import { POST, DELETE } from '../route';

function makeRequest(file?: File, method = 'POST') {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }
  const req = new Request('http://localhost/api/chatbots/chatbot-1/avatar', {
    method,
    body: method === 'POST' ? formData : undefined,
  });
  // The native Request.formData() can hang in jsdom; replace with a resolved mock
  Object.defineProperty(req, 'formData', {
    value: () => Promise.resolve(formData),
  });
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AWS_ENDPOINT_URL = 'https://s3.example.com';
  process.env.AWS_S3_BUCKET_NAME = 'test-bucket';
});

describe('POST /api/chatbots/[id]/avatar', () => {
  it('returns 404 when chatbot not found', async () => {
    vi.mocked(db.chatbot.findFirst).mockResolvedValue(null);
    const file = new File(['data'], 'avatar.png', { type: 'image/png' });
    const res = await POST(makeRequest(file) as any, {
      params: Promise.resolve({ id: 'chatbot-1' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when no file provided', async () => {
    vi.mocked(db.chatbot.findFirst).mockResolvedValue({
      id: 'chatbot-1',
      themeConfig: {},
    } as any);
    const res = await POST(makeRequest() as any, {
      params: Promise.resolve({ id: 'chatbot-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid MIME type', async () => {
    vi.mocked(db.chatbot.findFirst).mockResolvedValue({
      id: 'chatbot-1',
      themeConfig: {},
    } as any);
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
    const res = await POST(makeRequest(file) as any, {
      params: Promise.resolve({ id: 'chatbot-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when file exceeds 5MB', async () => {
    vi.mocked(db.chatbot.findFirst).mockResolvedValue({
      id: 'chatbot-1',
      themeConfig: {},
    } as any);
    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', {
      type: 'image/png',
    });
    const res = await POST(makeRequest(bigFile) as any, {
      params: Promise.resolve({ id: 'chatbot-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('uploads and returns avatarUrl on success', async () => {
    vi.mocked(db.chatbot.findFirst).mockResolvedValue({
      id: 'chatbot-1',
      themeConfig: {},
    } as any);
    vi.mocked(db.chatbot.update).mockResolvedValue({ id: 'chatbot-1' } as any);
    const fileData = new Uint8Array([1, 2, 3, 4]);
    const file = new File([fileData], 'avatar.webp', { type: 'image/webp' });
    // jsdom File may not implement arrayBuffer; patch it
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(fileData.buffer),
    });
    const res = await POST(makeRequest(file) as any, {
      params: Promise.resolve({ id: 'chatbot-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.avatarUrl).toContain('chatbot-avatars/chatbot-1/');
    const storage = getStorageProvider();
    expect(vi.mocked(storage.upload)).toHaveBeenCalledWith(
      expect.stringContaining('chatbot-avatars/chatbot-1/'),
      expect.any(Buffer),
    );
    expect(vi.mocked(db.chatbot.update)).toHaveBeenCalled();
  });

  it('deletes old avatar before uploading new one', async () => {
    const oldUrl =
      'https://s3.example.com/test-bucket/chatbot-avatars/chatbot-1/old.webp';
    vi.mocked(db.chatbot.findFirst).mockResolvedValue({
      id: 'chatbot-1',
      themeConfig: { avatarUrl: oldUrl },
    } as any);
    vi.mocked(db.chatbot.update).mockResolvedValue({ id: 'chatbot-1' } as any);
    const fileData = new Uint8Array([1, 2, 3]);
    const file = new File([fileData], 'avatar.webp', { type: 'image/webp' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(fileData.buffer),
    });
    const res = await POST(makeRequest(file) as any, {
      params: Promise.resolve({ id: 'chatbot-1' }),
    });
    expect(res.status).toBe(200);
    const storage = getStorageProvider();
    expect(vi.mocked(storage.delete)).toHaveBeenCalledWith(
      'chatbot-avatars/chatbot-1/old.webp',
    );
  });
});

describe('DELETE /api/chatbots/[id]/avatar', () => {
  it('returns 404 when chatbot not found', async () => {
    vi.mocked(db.chatbot.findFirst).mockResolvedValue(null);
    const req = new Request('http://localhost', { method: 'DELETE' });
    const res = await DELETE(req as any, {
      params: Promise.resolve({ id: 'chatbot-1' }),
    });
    expect(res.status).toBe(404);
  });

  it('deletes avatar and returns 200', async () => {
    vi.mocked(db.chatbot.findFirst).mockResolvedValue({
      id: 'chatbot-1',
      themeConfig: {
        avatarUrl:
          'https://s3.example.com/test-bucket/chatbot-avatars/chatbot-1/abc.webp',
      },
    } as any);
    vi.mocked(db.chatbot.update).mockResolvedValue({ id: 'chatbot-1' } as any);
    const req = new Request('http://localhost', { method: 'DELETE' });
    const res = await DELETE(req as any, {
      params: Promise.resolve({ id: 'chatbot-1' }),
    });
    expect(res.status).toBe(200);
    const storage = getStorageProvider();
    expect(vi.mocked(storage.delete)).toHaveBeenCalledWith(
      'chatbot-avatars/chatbot-1/abc.webp',
    );
    expect(vi.mocked(db.chatbot.update)).toHaveBeenCalled();
  });
});
