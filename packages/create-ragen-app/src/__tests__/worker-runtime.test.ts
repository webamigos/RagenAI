import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ADMIN_USER,
  DEFAULT_WORKER_CONCURRENCY,
  generateAdminPassword,
  resolveWorkerRuntimeSelection,
} from '../worker-runtime';

describe('resolveWorkerRuntimeSelection', () => {
  it('writes only the runtime for temporal', () => {
    const selection = resolveWorkerRuntimeSelection('temporal');

    expect(selection.envUpdates).toEqual({ WORKER_RUNTIME: 'temporal' });
    // Nothing to show: the Temporal UI is its own service, not ours to
    // configure.
    expect(selection.dashboard).toBeUndefined();
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
   * The code's default is 10 whole jobs, and the first thing a new install
   * meets is a bulk import — where 10 measured at roughly twice the latency of
   * 20, all of it spent waiting for a slot. Writing the number into `.env`
   * rather than relying on the default is what makes it a knob the operator
   * can find.
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
