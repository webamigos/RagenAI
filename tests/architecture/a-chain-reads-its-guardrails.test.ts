import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every chain that answers a user reaches the guardrail loader.
 *
 * This exists because of what the guardrails programme is a response to, and
 * because this repository has already paid for the lesson once: the monthly
 * usage ceilings were computed for five months and enforced by nothing, with
 * every static check green. `AGENTS.md` states the rule it cost us — *a limit
 * that is computed is not a limit; a limit is a call site.*
 *
 * A guardrail has the same shape of failure, and a worse one. Phase A's
 * measurement is the reference: with a `BLOCK` rule enabled, a chat turn left
 * `pg_stat_user_tables` untouched on both guardrail tables and went on to the
 * model. That was the correct result then. From B3 onward it is a silent loss
 * of protection that looks exactly like a working configuration — the panel
 * lists the rule, the audit entry exists, the chat answers normally.
 *
 * Checked as source text, on purpose. The behaviour is covered by unit tests
 * per chain, but a unit test can be deleted along with the call it covers and
 * the suite stays green with one fewer test. This asserts the call site still
 * exists in the file that has to make it, which is the thing that goes missing.
 *
 * **Its limit, stated rather than discovered**: it proves the loader is
 * *named*, not that it is reached on every path through the function. The
 * behavioural half is `evaluateInputStage`'s own suite plus the per-chain
 * tests; this is the tripwire for the case where somebody removes the line.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** Every chain that answers a user, and how it reaches its rules. */
const CHAINS: Array<{ file: string; mustMention: string[]; why: string }> = [
  {
    file: 'apps/web/src/libs/chains/basic-rag/chain.ts',
    mustMention: ['getOrgGuardrailsQuery(', 'runInputGuardrailsCommand('],
    why: '/api/threads, /api/guest-threads and the chatbot widget all build this chain',
  },
  {
    file: 'apps/web/src/libs/chains/conversation-chain/chain.ts',
    mustMention: ['getOrgGuardrailsQuery(', 'runInputGuardrailsCommand('],
    why: 'the non-retrieval chat path — a turn with no knowledge base is still a turn',
  },
  {
    file: 'apps/api/src/chains/basic-rag/chain.ts',
    // Injected rather than imported: the chain is a plain function and the
    // loader is a Nest service, so the assembly site supplies it.
    mustMention: ['config?.guardrails', 'guardrails.run('],
    why: 'the public API — /chat and /chat/completions',
  },
  {
    file: 'apps/api/src/chains/basic-rag/initialize-basic-rag.service.ts',
    mustMention: ['forOrganization(', 'runGuardrails.run('],
    why: 'the assembly site that hands the API chain its rules',
  },
];

/**
 * The file's body: no comments, and **no import statements**.
 *
 * Dropping the imports is the part that matters, and the first version of this
 * test did not. Removing the guardrail call from a chain leaves its import at
 * the top, so a check for the symbol anywhere in the file kept passing — a
 * guard that was vacuous for precisely the case it exists to catch. Verified
 * by deleting the call and watching this test go red.
 */
const read = (file: string) =>
  readFileSync(join(REPO_ROOT, file), 'utf8')
    // Comments only mention these; a chain that merely explains guardrails in
    // prose is not a chain that evaluates them.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*import[\s\S]*?from\s*'[^']*';/gm, '');

describe('a chain reads its guardrails', () => {
  it.each(CHAINS)('$file', ({ file, mustMention, why }) => {
    const code = read(file);

    const missing = mustMention.filter((symbol) => !code.includes(symbol));

    expect(
      missing,
      `${file} no longer reaches the guardrail loader (${why}).\n\n` +
        'A rule enabled in the panel would be listed, audited, and enforced ' +
        'by nothing — which is indistinguishable from the configuration ' +
        'working. See the Phase A measurement in the guardrails spec: the ' +
        'counters have to move at this commit.',
    ).toEqual([]);
  });

  it('no chain still reads MODERATION_ENABLED', () => {
    // The gate guardrails replaced. A chain reading both would be deciding
    // moderation twice, and the env read wins by running first.
    const offenders = CHAINS.map((chain) => chain.file).filter((file) =>
      read(file).includes('MODERATION_ENABLED'),
    );

    expect(
      offenders,
      'MODERATION_ENABLED is retired in Phase B; the rule set is the gate now',
    ).toEqual([]);
  });

  it('covers every chain that builds a moderation instance', () => {
    // The list above is exhaustive by design, and this is what keeps it
    // honest: a fifth chain that takes a `contentModerator` is a fifth
    // surface that can refuse — or fail to.
    const known = new Set(CHAINS.map((chain) => chain.file));
    const candidates = [
      'apps/web/src/libs/chains/basic-rag/chain.ts',
      'apps/web/src/libs/chains/conversation-chain/chain.ts',
      'apps/api/src/chains/basic-rag/chain.ts',
    ];

    const unguarded = candidates.filter(
      (file) => read(file).includes('contentModerator') && !known.has(file),
    );

    expect(
      unguarded,
      'a chain takes a moderator and is not in the list above',
    ).toEqual([]);
  });
});
