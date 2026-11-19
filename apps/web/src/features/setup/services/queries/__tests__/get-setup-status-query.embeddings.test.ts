import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/features/parsing/services/queries/get-parser-status-query', () => ({
  getParserStatusQuery: vi.fn(async () => ({ state: 'up' })),
}));

const routeFor = vi.hoisted(() => vi.fn());
const gatewayFromEnv = vi.hoisted(() => vi.fn());
vi.mock('@ragenai/llm-gateway', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ragenai/llm-gateway')>()),
  gatewayFromEnv,
}));

import {
  getSetupStatusQuery,
  resetModelProbeCache,
} from '../get-setup-status-query';

/**
 * The wiring between the route table and the dimension check: the check is a
 * function of its arguments, so this is the only place that proves the setup
 * page actually hands it the route's `dimensions`.
 */
const mismatch = async () =>
  (await getSetupStatusQuery()).report.findings.find(
    (f) => f.id === 'embeddings-dimension-mismatch',
  );

beforeEach(() => {
  routeFor.mockReset();
  gatewayFromEnv.mockReset();
  gatewayFromEnv.mockReturnValue({ routeFor, probe: async () => [] });
  resetModelProbeCache();
  vi.stubEnv('EMBEDDINGS_MODEL', 'local-embed');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSetupStatusQuery — an embedding route that declares its size', () => {
  it('reports VECTOR_SIZE disagreeing with the route of EMBEDDINGS_MODEL', async () => {
    routeFor.mockReturnValue({ dimensions: 1024 });
    vi.stubEnv('VECTOR_SIZE', '768');

    expect(await mismatch()).toMatchObject({
      severity: 'required',
      values: { model: 'local-embed', expected: 1024, configured: '768' },
    });
    expect(routeFor).toHaveBeenCalledWith('local-embed');
  });

  it('says nothing when they agree', async () => {
    routeFor.mockReturnValue({ dimensions: 1024 });
    vi.stubEnv('VECTOR_SIZE', '1024');

    expect(await mismatch()).toBeUndefined();
  });

  it('says nothing for a route that declares no size', async () => {
    routeFor.mockReturnValue({ model: 'bge-m3' });
    vi.stubEnv('VECTOR_SIZE', '768');

    expect(await mismatch()).toBeUndefined();
  });

  // An unreadable route table has its own way of surfacing; this page must
  // still render.
  it('does not fail the page when the route table cannot be read', async () => {
    gatewayFromEnv.mockImplementation(() => {
      throw new Error('invalid route table');
    });
    vi.stubEnv('VECTOR_SIZE', '768');

    await expect(getSetupStatusQuery()).resolves.toBeDefined();
    expect(await mismatch()).toBeUndefined();
  });
});
