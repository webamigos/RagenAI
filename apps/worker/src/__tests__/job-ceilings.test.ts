import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The ceilings the worker hands to BullMQ.
 *
 * `@ragenai/jobs-bullmq` proves a ceiling holds across replicas; this proves
 * the worker asks for the right ones. It is the only place the Docling ceiling
 * exists, and a job name typed wrong here is a ceiling on nothing.
 */
const load = async (env: Record<string, string>) => {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  const { jobConcurrencyCeilings } = await import('../job-ceilings.js');
  return jobConcurrencyCeilings();
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('jobConcurrencyCeilings', () => {
  it('holds ingest to four at once across the deployment by default', async () => {
    // Four: docling-serve converts two at a time and queues the rest; two more
    // waiting keep it busy without a backlog the worker cannot see.
    expect(await load({})).toMatchObject({ runFileEmbeddings: 4 });
  });

  it('reads DOCLING_MAX_CONCURRENCY', async () => {
    expect(await load({ DOCLING_MAX_CONCURRENCY: '2' })).toMatchObject({
      runFileEmbeddings: 2,
    });
  });

  it('keeps Brain extraction at one', async () => {
    expect(await load({})).toMatchObject({ brainExtract: 1 });
  });

  it('names only jobs that exist', async () => {
    const { JOB_NAMES } = await import('@ragenai/jobs');
    for (const job of Object.keys(await load({}))) {
      expect(JOB_NAMES).toContain(job);
    }
  });
});
