import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fragments } from '../../packages/env/src';
import {
  DEFAULT_GATEWAY_MODE,
  GATEWAY_MODES,
} from '../../packages/llm-gateway/src/gateway-mode';

/**
 * `LLM_GATEWAY` is spelled out in two places on purpose.
 *
 * `@ragenai/llm-gateway` owns the modes, because it is what acts on them.
 * `@ragenai/env` restates them, because importing the gateway would pull five
 * AI SDK provider packages into every process that merges an env fragment —
 * including ones that never make a model call.
 *
 * Restating is fine as long as the two cannot drift, and drift here is the bad
 * kind: adding a third mode to the gateway without adding it to the schema
 * makes the new value a boot failure, while removing one from the gateway and
 * leaving it in the schema makes it a runtime throw on the first model call.
 * Neither says what went wrong.
 */
describe('LLM_GATEWAY is described the same way in both packages', () => {
  const schema = fragments.litellm.shape.LLM_GATEWAY;

  it('accepts exactly the gateway package modes', () => {
    for (const mode of GATEWAY_MODES) {
      expect(schema.safeParse(mode).success).toBe(true);
    }
  });

  it('rejects a value the gateway package does not know', () => {
    expect(schema.safeParse('vertex-direct').success).toBe(false);
    expect(schema.safeParse('nativ').success).toBe(false);
  });

  it('defaults to the same mode the gateway defaults to', () => {
    expect(schema.parse(undefined)).toBe(DEFAULT_GATEWAY_MODE);
  });

  /**
   * The comment in `fragments.ts` is what tells the next person why the list
   * is duplicated and where the other copy is. It has been deleted before in
   * files like this one, which is how a restated list quietly becomes a
   * forgotten one.
   */
  it('keeps the pointer back to the gateway package next to the values', () => {
    const source = readFileSync(
      join(process.cwd(), 'packages/env/src/fragments.ts'),
      'utf8',
    );
    expect(source).toContain('@ragenai/llm-gateway');
    expect(source).toContain('GATEWAY_MODES');
  });
});
