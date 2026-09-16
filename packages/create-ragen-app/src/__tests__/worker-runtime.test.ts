import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ADMIN_USER,
  DEFAULT_REDIS_URL,
  DEFAULT_TEMPORAL_SERVER_ADDRESS,
  DEFAULT_WORKER_CONCURRENCY,
  generateAdminPassword,
  resolveWorkerRuntimeSelection,
} from '../worker-runtime';

describe('resolveWorkerRuntimeSelection', () => {
  /**
   * The address is written with the runtime, not left to `.env.example`: the
   * seam makes it mandatory under Temporal, and ADR-44 took the server out of
   * the compose file — so the value now names something the operator runs.
   */
  it('writes the runtime and the address it was given for temporal', () => {
    const selection = resolveWorkerRuntimeSelection('temporal', {
      temporalServerAddress: 'temporal.internal:7233',
    });

    expect(selection.envUpdates).toEqual({
      WORKER_RUNTIME: 'temporal',
      TEMPORAL_SERVER_ADDRESS: 'temporal.internal:7233',
    });
    // Nothing to show: the Temporal UI is its own service, not ours to
    // configure.
    expect(selection.dashboard).toBeUndefined();
  });

  it('falls back to the adapter’s own address when the answer is blank', () => {
    const selection = resolveWorkerRuntimeSelection('temporal', {
      temporalServerAddress: '   ',
    });

    expect(selection.envUpdates.TEMPORAL_SERVER_ADDRESS).toBe(
      DEFAULT_TEMPORAL_SERVER_ADDRESS,
    );
  });

  /**
   * The fallback points at BullMQ now, and the direction matters. It used to
   * answer Temporal, which was right while the compose file ran one; after
   * ADR-44 an unexpected value — a future variant, a mistyped flag — would
   * otherwise scaffold an install whose worker connects to a server nobody
   * started.
   */
  it('treats anything that is not temporal as the default runtime', () => {
    const selection = resolveWorkerRuntimeSelection(
      'sqs' as unknown as 'bullmq',
    );

    expect(selection.choice).toBe('bullmq');
    expect(selection.envUpdates.WORKER_RUNTIME).toBe('bullmq');
  });

  /**
   * Since #1224 the producers validate this at boot: apps/web and apps/api
   * enqueue, BullMQ gives them no fallback, and a scaffolded install missing
   * the variable would refuse to start rather than fail at the first upload.
   */
  it('writes the Redis url BullMQ cannot run without', () => {
    const selection = resolveWorkerRuntimeSelection('bullmq');

    expect(selection.envUpdates.REDIS_URL).toBe(DEFAULT_REDIS_URL);
    // The published port, not 6379: a native Redis on the standard one answers
    // instead of the container.
    expect(DEFAULT_REDIS_URL).toContain('56379');
  });

  /**
   * The dashboard is off unless both credentials are set, so an installer that
   * chose BullMQ and left them blank would ship the runtime with no way to see
   * its own queues — which is what the Temporal UI gave away for free.
   */
  it('configures the dashboard when bullmq is chosen', () => {
    const selection = resolveWorkerRuntimeSelection('bullmq');

    expect(selection.envUpdates.WORKER_RUNTIME).toBe('bullmq');
    expect(selection.envUpdates.WORKER_ADMIN_USER).toBe(DEFAULT_ADMIN_USER);
    expect(selection.envUpdates.WORKER_ADMIN_PASSWORD).toBeTruthy();
    expect(selection.envUpdates.WORKER_ADMIN_PORT).toBe('8090');
  });

  /**
   * The code's default is 20 whole jobs since D2 raised it from 10 — the first
   * thing a new install meets is a bulk import, where 10 measured at roughly
   * twice the latency of 20, all of it spent waiting for a slot. Writing the
   * number into `.env` anyway, rather than relying on a default that now
   * agrees with it, is what makes it a knob the operator can find when a
   * provider starts rate-limiting.
   */
  it('writes an explicit concurrency for bullmq', () => {
    const selection = resolveWorkerRuntimeSelection('bullmq');

    expect(selection.envUpdates.WORKER_CONCURRENCY).toBe(
      DEFAULT_WORKER_CONCURRENCY,
    );
  });

  it('writes no concurrency for temporal, where the variable does nothing', () => {
    const selection = resolveWorkerRuntimeSelection('temporal');

    expect(selection.envUpdates.WORKER_CONCURRENCY).toBeUndefined();
  });

  it('reports the credentials so the installer can show them once', () => {
    const selection = resolveWorkerRuntimeSelection('bullmq');

    expect(selection.dashboard).toEqual({
      user: DEFAULT_ADMIN_USER,
      password: selection.envUpdates.WORKER_ADMIN_PASSWORD,
      port: '8090',
    });
  });

  /**
   * The reason this is generated rather than a fixed default: a password in
   * the repository is the same password on every install, on a port that shows
   * every job's payload. The first person to read the source has it everywhere.
   */
  it('gives every install a different password', () => {
    const passwords = new Set(
      Array.from(
        { length: 20 },
        () =>
          resolveWorkerRuntimeSelection('bullmq').envUpdates
            .WORKER_ADMIN_PASSWORD,
      ),
    );

    expect(passwords.size).toBe(20);
  });

  // Read off a terminal and typed into a browser prompt, unlike the 64-hex
  // secrets the manifest generates.
  it('generates something short enough to retype', () => {
    const password = generateAdminPassword();

    expect(password.length).toBeGreaterThanOrEqual(12);
    expect(password.length).toBeLessThanOrEqual(24);
    // base64url, so no characters that need escaping in a shell or a .env line.
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
