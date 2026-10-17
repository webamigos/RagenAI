import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@ragenai/prisma-client', () => ({
  default: { user: { findFirst: vi.fn(async () => ({ id: 'admin-1' })) } },
}));
vi.mock('../../install-claim', () => ({
  backfillClaimIfAdminExists: vi.fn(async () => undefined),
  isInstallClaimed: vi.fn(async () => true),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const getParserStatusQuery = vi.hoisted(() => vi.fn());
vi.mock('@/features/parsing/services/queries/get-parser-status-query', () => ({
  getParserStatusQuery,
}));

const checkBasalHealth = vi.hoisted(() => vi.fn());
vi.mock('@ragenai/basal-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ragenai/basal-client')>()),
  checkBasalHealth,
}));

const probe = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
vi.mock('@ragenai/llm-gateway', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ragenai/llm-gateway')>()),
  gatewayFromEnv: () => ({ probe }),
}));

import {
  getSetupStatusQuery,
  resetModelProbeCache,
} from '../get-setup-status-query';

const ids = (status: Awaited<ReturnType<typeof getSetupStatusQuery>>) =>
  status.report.findings.map((f) => f.id);

beforeEach(() => {
  getParserStatusQuery.mockReset();
  probe.mockReset();
  probe.mockResolvedValue([]);
  resetModelProbeCache();
});

describe('getSetupStatusQuery — Docling (spec C1, D5)', () => {
  it('reports a parser outage as a recommended finding, with since when', async () => {
    getParserStatusQuery.mockResolvedValue({
      state: 'down',
      since: '2026-09-28T07:15:00.000Z',
    });
    const status = await getSetupStatusQuery();
    expect(
      status.report.findings.find((f) => f.id === 'docling-unavailable'),
    ).toMatchObject({
      severity: 'recommended',
      values: { since: Date.parse('2026-09-28T07:15:00.000Z') },
    });
  });

  it.each([
    ['up', { state: 'up' }],
    ['unknown', { state: 'unknown' }],
  ])('adds nothing when the parser is %s', async (_, parser) => {
    getParserStatusQuery.mockResolvedValue(parser);
    expect(ids(await getSetupStatusQuery())).not.toContain(
      'docling-unavailable',
    );
  });
});

describe('getSetupStatusQuery — basal (basal spec, B3)', () => {
  beforeEach(() => {
    getParserStatusQuery.mockResolvedValue({ state: 'up' });
    checkBasalHealth.mockReset();
    vi.unstubAllEnvs();
  });

  it('says nothing and asks nothing when BASAL_URL is not set', async () => {
    vi.stubEnv('BASAL_URL', '');

    expect(ids(await getSetupStatusQuery())).not.toContain('basal-unavailable');
    expect(checkBasalHealth).not.toHaveBeenCalled();
  });

  it('reports a basal that does not answer as a recommended finding', async () => {
    vi.stubEnv('BASAL_URL', 'http://basal:8000');
    checkBasalHealth.mockResolvedValue('down');

    const status = await getSetupStatusQuery();

    expect(
      status.report.findings.find((f) => f.id === 'basal-unavailable'),
    ).toMatchObject({ severity: 'recommended', vars: ['BASAL_URL'] });
    expect(checkBasalHealth).toHaveBeenCalledWith({ url: 'http://basal:8000' });
  });

  it('adds nothing when basal is up', async () => {
    vi.stubEnv('BASAL_URL', 'http://basal:8000');
    checkBasalHealth.mockResolvedValue('up');

    expect(ids(await getSetupStatusQuery())).not.toContain('basal-unavailable');
  });
});

describe('getSetupStatusQuery — local model servers (appliance spec, B3)', () => {
  beforeEach(() => {
    getParserStatusQuery.mockResolvedValue({ state: 'up' });
    vi.unstubAllEnvs();
    vi.stubEnv('BASAL_URL', '');
  });

  it('probes the models the install selects, once each', async () => {
    vi.stubEnv('DEFAULT_MODEL', 'local-chat');
    vi.stubEnv('REPHRASE_MODEL', 'local-small');
    vi.stubEnv('SUMMARY_MODEL', 'local-small');
    vi.stubEnv('EMBEDDINGS_MODEL', 'local-embed');

    await getSetupStatusQuery();

    expect(probe).toHaveBeenCalledWith([
      'local-chat',
      'local-small',
      'local-embed',
    ]);
  });

  it('reports a server that does not answer, naming its variable', async () => {
    vi.stubEnv('DEFAULT_MODEL', 'local-chat');
    probe.mockResolvedValue([
      { modelId: 'local-chat', state: 'unreachable', connection: 'ollama' },
    ]);

    const status = await getSetupStatusQuery();

    expect(
      status.report.findings.find((f) => f.id === 'model-server-unreachable'),
    ).toMatchObject({
      severity: 'recommended',
      vars: ['LLM_OLLAMA_BASE_URL'],
      values: { connections: 'ollama' },
    });
  });

  it('asks the servers at most once per cache window', async () => {
    vi.stubEnv('DEFAULT_MODEL', 'local-chat');

    await getSetupStatusQuery();
    await getSetupStatusQuery();

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('adds nothing, and does not fail the page, when the probe throws', async () => {
    vi.stubEnv('DEFAULT_MODEL', 'local-chat');
    probe.mockRejectedValue(new Error('no route table'));

    const status = await getSetupStatusQuery();

    expect(ids(status)).not.toContain('model-server-unreachable');
  });
});
