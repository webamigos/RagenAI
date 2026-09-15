import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Per-team `rpm` and `tpm` are enforced by this application.
 *
 * This file replaces `only-rate-limits-reach-the-proxy.test.ts`, and the
 * replacement is the point rather than a tidy-up. That guard held an
 * obligation: budgets and allowlists had moved into the database, `tpm`/`rpm`
 * had not, and the proxy was the only thing enforcing them — so it failed if
 * the forwarding ever stopped while nothing had replaced it
 * ([Q3](../../docs/specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md)).
 *
 * B5 removed the virtual keys, which were the vehicle. The guard fired,
 * correctly, and the answer was to build the replacement rather than to delete
 * the guard — `checkTeamRateLimitQuery`. What follows is the same obligation
 * pointed at where it now lives, because two fields collected in a settings
 * panel and enforced by nothing is the exact shape this whole phase exists to
 * remove, and it is invisible from any unit test of the settings form.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');

const LIMITER =
  'apps/web/src/features/teams/services/queries/check-team-rate-limit-query.ts';

function source(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (
      entry === 'node_modules' ||
      entry === '.next' ||
      entry === 'dist' ||
      entry === 'generated'
    ) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.tsx?$/.test(full)) {
      yield full;
    }
  }
}

describe('per-team rate limits are enforced by the application', () => {
  it('the limiter reads both fields the settings panel collects', () => {
    const body = source(LIMITER);

    for (const field of ['rpmLimit', 'tpmLimit']) {
      expect(
        body.includes(field),
        `${LIMITER} no longer reads ${field}. The team settings panel still ` +
          `collects it, so this would leave a field that does nothing — the ` +
          `shape Q3 exists to prevent.`,
      ).toBe(true);
    }
  });

  /**
   * A limiter nothing calls is the same as no limiter, and that is not a
   * hypothesis here: the monthly ceilings had a complete, tested
   * `checkUsageLimitsQuery` and no callers for five months.
   */
  it('a chat surface actually calls it', () => {
    const callers = [...walk(join(REPO_ROOT, 'apps', 'web', 'src'))]
      .filter((file) => !/__tests__|\.test\.tsx?$/.test(file))
      .filter((file) =>
        /\bassertWithinTeamRateLimit\s*\(/.test(readFileSync(file, 'utf8')),
      )
      .map((file) => relative(REPO_ROOT, file))
      // The module that defines it does not count as a caller.
      .filter((file) => !file.endsWith('check-team-rate-limit-query.ts'));

    expect(
      callers.length,
      'Nothing calls assertWithinTeamRateLimit. A limit that is computed is ' +
        'not a limit — a limit is a call site.',
    ).toBeGreaterThan(0);
  });

  /**
   * "Something calls it" was too weak, and weak in the way that mattered: it
   * passed for months while **only** the panel enforced. The public API routes
   * resolved the same team for attribution and charged nothing, so an
   * integration key kept its limit only while the proxy was still in the path.
   *
   * Every entry point is therefore named, and a new one has to be added here
   * deliberately — which is the point. Reaching the limiter through
   * `refuseIfOverTeamRateLimit` counts; that helper is checked below.
   */
  const CHAT_ENTRY_POINTS = [
    'apps/web/src/app/api/threads/services/assistant-stream.ts',
    'apps/web/src/app/api/v1/chat/route.ts',
    'apps/web/src/app/api/v1/chat/completions/route.ts',
  ];

  it.each(CHAT_ENTRY_POINTS)('%s reaches the limiter', (entryPoint) => {
    const text = source(entryPoint);
    // An invocation, not a mention: an import, a comment or a renamed
    // identifier all contain the name, and the first version of this guard
    // was fooled by exactly that.
    const reaches =
      /\b(?:assertWithinTeamRateLimit|refuseIfOverTeamRateLimit)\s*\(/.test(
        text,
      );

    expect(
      reaches,
      `${entryPoint} starts a model turn without charging the team's ` +
        'per-minute limit. Every chat entry point enforces, or the limit is ' +
        'only as real as the least-guarded way in.',
    ).toBe(true);
  });

  it('the API refusal helper is the limiter, not a copy of it', () => {
    const helper = source('apps/web/src/app/api/v1/check-team-rate-limit.ts');

    expect(
      helper.includes('checkTeamRateLimitQuery'),
      'refuseIfOverTeamRateLimit must delegate to checkTeamRateLimitQuery — a ' +
        'second implementation is a second thing to keep in step.',
    ).toBe(true);
    expect(
      helper.includes('429'),
      'A refusal that is not a 429 is not a rate limit to any client.',
    ).toBe(true);
  });

  /**
   * apps/api ported the chat orchestration rather than proxying to apps/web's
   * internal routes, so the enforcement above does not reach it — and it has
   * never had a team limiter of its own (no Redis client, no team resolution).
   *
   * This is recorded rather than asserted because it is outstanding work, not
   * a regression from B5. The assertion is inverted deliberately: when apps/api
   * gains enforcement, this test fails and whoever did it deletes the note.
   */
  it('records that apps/api still has no team limiter', () => {
    const apiSources = [...walk(join(REPO_ROOT, 'apps', 'api', 'src'))]
      .filter((file) => !/\.spec\.ts$/.test(file))
      .filter((file) => !file.includes('generated'))
      .filter((file) =>
        readFileSync(file, 'utf8').includes('checkTeamRateLimitQuery'),
      );

    expect(
      apiSources.length,
      'apps/api now references the team limiter. Add its chat entry points to ' +
        'CHAT_ENTRY_POINTS above and delete this test.',
    ).toBe(0);
  });

  /**
   * The refusal reaches the user through `chain-errors.<code>`, so a code with
   * no message is a blank error bubble.
   */
  it('its error code has a message in every locale', () => {
    const messagesDir = join(
      REPO_ROOT,
      'apps',
      'web',
      'src',
      'app',
      'messages',
    );
    const locales = readdirSync(messagesDir).filter((f) => f.endsWith('.json'));

    expect(locales.length).toBeGreaterThan(0);

    for (const locale of locales) {
      const messages = JSON.parse(
        readFileSync(join(messagesDir, locale), 'utf8'),
      ) as { 'chain-errors'?: Record<string, string> };

      expect(
        messages['chain-errors']?.['rate-limit-exceeded'],
        `${locale} has no chain-errors.rate-limit-exceeded`,
      ).toBeTruthy();
    }
  });

  /**
   * The virtual keys are gone, so nothing may grow a *call* to a proxy team
   * write again — that was `apps/admin`'s mistake before ADR-34, made twice.
   *
   * The two LiteLLM clients still declare these functions and now have no
   * callers at all; B6 deletes the clients. Excluding them here is what makes
   * this a check on callers rather than on declarations.
   */
  it('nothing calls a proxy team write any more', () => {
    const CLIENTS = [
      join('apps', 'api', 'src', 'litellm', 'client.ts'),
      join('apps', 'web', 'src', 'libs', 'litellm', 'client.ts'),
    ];

    const offenders = [...walk(join(REPO_ROOT, 'apps'))]
      .filter((file) => {
        const body = readFileSync(file, 'utf8');
        return (
          body.includes('createLiteLLMTeam') ||
          body.includes('updateLiteLLMTeam')
        );
      })
      .map((file) => relative(REPO_ROOT, file))
      .filter((file) => !CLIENTS.includes(file))
      // apps/admin's proxy page is read-only reporting and goes at B6.
      .filter((file) => !file.startsWith(join('apps', 'admin')));

    expect(
      offenders,
      `proxy team writes came back: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
