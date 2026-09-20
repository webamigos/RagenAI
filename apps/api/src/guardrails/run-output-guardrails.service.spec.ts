import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedGuardrail } from '@ragenai/guardrails';

import { RunOutputGuardrailsService } from './run-output-guardrails.service.js';

/**
 * The binding, tested apart from the window it binds.
 *
 * Root `AGENTS.md` names this shape exactly: a thin file that is the only
 * place a piece of wiring exists, where a mistake fails silently. Two could go
 * wrong here and neither would throw — a hit filed against the input stage, so
 * an operator filtering the incidents page for output blocks finds nothing;
 * and a window built for an organization with no output rules, which buffers
 * every answer the API serves for no reason.
 *
 * What the event itself carries — and what it must not — is
 * `guardrail-hit.service.spec.ts`, because that is where it is decided. A
 * `hits.record` call is handed the whole rule, `pattern` included, so an
 * assertion here that the text never appears would be about this test's own
 * argument list rather than about the row anybody stores.
 */

const rule = (over: Partial<ResolvedGuardrail> = {}): ResolvedGuardrail => ({
  publicId: 'rule-1',
  organizationId: null,
  key: null,
  name: 'Secrets',
  description: null,
  kind: 'PATTERN',
  stage: 'OUTPUT',
  action: 'LOG',
  enabled: true,
  severity: 'warn',
  pattern: 'hunter2',
  patternIsRegex: false,
  threshold: null,
  isPlatformRule: true,
  sources: {
    enabled: 'platform-rule',
    action: 'platform-rule',
    threshold: 'platform-rule',
  },
  ...over,
});

const guardrails = (output: ResolvedGuardrail[]) =>
  ({ input: [], output, degraded: false, dropped: [] }) as never;

describe('RunOutputGuardrailsService', () => {
  let hits: { record: ReturnType<typeof vi.fn> };
  let service: RunOutputGuardrailsService;
  let warn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    hits = { record: vi.fn() };
    service = new RunOutputGuardrailsService(hits as never);
    warn = vi.fn();
    (service as unknown as { logger: { warn: unknown } }).logger = {
      warn,
    };
  });

  it('builds nothing when the organization has no output rules', () => {
    expect(
      service.stageFor({
        guardrails: guardrails([]),
        organizationId: 'org-1',
        source: 'api',
      }),
    ).toBeUndefined();
  });

  it('files a hit against the output stage, with the surface it arrived on', () => {
    const stage = service.stageFor({
      guardrails: guardrails([rule()]),
      organizationId: 'org-1',
      userId: 'user-1',
      source: 'api',
    });

    stage?.push('the key is hunter2 and that is all');
    stage?.flush();

    expect(hits.record).toHaveBeenCalledTimes(1);
    expect(hits.record).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'OUTPUT',
        source: 'api',
        organizationId: 'org-1',
        userId: 'user-1',
        matchCount: 1,
      }),
    );
  });

  it('logs a skipped rule rather than filing it as a hit', () => {
    // An event says a rule fired. A rule that could not run is the opposite
    // claim, and filing it as one puts a row on the incidents page for a
    // budget problem and inflates the hit counts on the guardrails page.
    //
    // A zero budget with a stopped clock is what a misbehaving pattern looks
    // like from here, and the only way to reach this branch without depending
    // on how fast the machine is.
    const stage = service.stageFor(
      {
        guardrails: guardrails([rule()]),
        organizationId: 'org-1',
        source: 'api',
      },
      { budgetMs: 0, now: () => 1_000 },
    );

    stage?.push('the key is hunter2');
    stage?.flush();

    expect(hits.record).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('org-1');
  });
});
