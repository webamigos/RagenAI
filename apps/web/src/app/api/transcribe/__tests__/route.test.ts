import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();
const mockGetOrgIdFromAuth = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockTranscribe = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: {
    api: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  },
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuth: (...args: unknown[]) => mockGetOrgIdFromAuth(...args),
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({
    isFeatureEnabledQuery: (...args: unknown[]) =>
      mockIsFeatureEnabled(...args),
  }),
);
vi.mock('@/libs/speech', () => ({
  getSttProvider: () =>
    Promise.resolve({
      transcribe: (...args: unknown[]) => mockTranscribe(...args),
    }),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from '../route';

function makeRequest() {
  const formData = new FormData();
  const audio = new File(['audio-bytes'], 'clip.webm', { type: 'audio/webm' });
  // jsdom's File does not implement arrayBuffer()
  Object.defineProperty(audio, 'arrayBuffer', {
    value: () => Promise.resolve(new ArrayBuffer(8)),
  });
  formData.append('audio', audio);
  const req = new Request('http://localhost/api/transcribe', {
    method: 'POST',
    body: formData,
  });
  // The native Request.formData() can hang in jsdom; replace with a resolved mock
  Object.defineProperty(req, 'formData', {
    value: () => Promise.resolve(formData),
  });
  return req as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
  mockGetOrgIdFromAuth.mockResolvedValue('org-1');
  mockIsFeatureEnabled.mockResolvedValue(true);
  mockTranscribe.mockResolvedValue('transcribed text');
});

describe('POST /api/transcribe', () => {
  it('transcribes when voiceInput is enabled for the organization', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      text: 'transcribed text',
    });
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith('org-1', 'voiceInput');
  });

  it('refuses with 403 when voiceInput is disabled, without calling the provider', async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);

    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
    // The point of the gate: transcription is billed per request, so a
    // disabled org must not reach the provider even by calling the route
    // directly, with the composer's microphone hidden.
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request before resolving features', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
  });

  it('rejects a session with no active organization', async () => {
    mockGetOrgIdFromAuth.mockResolvedValue(null);

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mockTranscribe).not.toHaveBeenCalled();
  });
});
