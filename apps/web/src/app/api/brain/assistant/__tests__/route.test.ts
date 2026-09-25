import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  access: vi.fn(),
  userId: vi.fn(),
  run: vi.fn(),
}));

vi.mock('@/features/brain/services/queries/get-brain-access-query', () => ({
  getBrainAccessQuery: m.access,
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({ getCurrentUserId: m.userId }));
vi.mock(
  '@/features/brain-assistant/services/commands/run-brain-assistant-turn-command',
  () => ({ runBrainAssistantTurnCommand: m.run }),
);
vi.mock('@/features/teams/utils/active-team-cookie', () => ({
  getActiveTeamIdFromCookie: vi.fn().mockResolvedValue(null),
}));

const { POST } = await import('../route');

const post = (body: unknown) =>
  POST(
    new Request('http://x/api/brain/assistant', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
const valid = { question: 'What first?', screen: { view: 'inbox' } };

beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({
    orgId: 'org-session',
    access: 'write',
    canWrite: true,
    assistant: true,
  });
  m.userId.mockResolvedValue('u-session');
  m.run.mockImplementation(async function* () {
    yield { type: 'start', threadId: 't' };
    yield { type: 'text', delta: 'Hi' };
    yield { type: 'done', messageId: 'm' };
  });
});

describe('POST /api/brain/assistant', () => {
  it('404s when Brain is closed to the person or the assistant is off', async () => {
    m.access.mockResolvedValue(null);
    expect((await post(valid)).status).toBe(404);
    m.access.mockResolvedValue({
      orgId: 'o',
      access: 'write',
      canWrite: true,
      assistant: false,
    });
    expect((await post(valid)).status).toBe(404);
    expect(m.run).not.toHaveBeenCalled();
  });

  it('400s on a body it cannot read', async () => {
    expect((await post('not json')).status).toBe(400);
    expect(
      (await post({ question: '', screen: { view: 'inbox' } })).status,
    ).toBe(400);
  });

  it('takes the organization, person and write access from the session', async () => {
    await post({ ...valid, orgId: 'org-forged', canWrite: true });
    expect(m.run).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-session',
        userId: 'u-session',
        canWrite: true,
        question: 'What first?',
      }),
    );
    m.access.mockResolvedValue({
      orgId: 'org-session',
      access: 'read',
      canWrite: false,
      assistant: true,
    });
    await post(valid);
    expect(m.run).toHaveBeenLastCalledWith(
      expect.objectContaining({ canWrite: false }),
    );
  });

  it('streams one JSON event per line', async () => {
    const response = await post(valid);
    expect(response.headers.get('Content-Type')).toContain('ndjson');
    const lines = (await response.text()).trim().split('\n');
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { type: 'start', threadId: 't' },
      { type: 'text', delta: 'Hi' },
      { type: 'done', messageId: 'm' },
    ]);
  });
});
