import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LLM_PROVIDERS } from '../../packages/create-ragen-app/src/llm-provider';

/**
 * infra/litellm/config.yaml carries a commented OpenAI/Anthropic example
 * pair specifically so a manual (non-CLI) self-hoster sees the fastest path
 * to a working model. `npx create-ragen-app` inserts the same model/key pair
 * for real when someone picks a provider. The two are written independently
 * (a hand-commented YAML example vs. a TS constant used to build a real
 * entry), so nothing stops them drifting apart if one changes without the
 * other — this asserts they still agree.
 */

const CONFIG_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'infra',
  'litellm',
  'config.yaml',
);

/**
 * Splits `model_list:` into one chunk per `- model_name:` entry, so a
 * provider's three fields are checked as belonging to the *same* entry —
 * three independent `.includes()` calls would also pass if, say, one
 * entry's `model_name` happened to sit near a different entry's `api_key`.
 *
 * Bounded to the `model_list:` section itself (up to the next root-level —
 * i.e. unindented, non-comment — YAML key), so a stray `model_name:`-shaped
 * line elsewhere in the file (litellm_settings, router_settings, a comment)
 * can't satisfy the assertion in place of a real model_list entry.
 */
function modelListEntries(configText: string): string[] {
  const lines = configText.split('\n');
  const sectionStart = lines.findIndex((line) => line.trim() === 'model_list:');
  if (sectionStart === -1) {
    throw new Error('config.yaml has no `model_list:` key.');
  }

  const nextRootKeyOffset = lines
    .slice(sectionStart + 1)
    .findIndex((line) => /^[A-Za-z]/.test(line));
  const sectionEnd =
    nextRootKeyOffset === -1
      ? lines.length
      : sectionStart + 1 + nextRootKeyOffset;

  const section = lines.slice(sectionStart, sectionEnd);
  const startIndices = section
    .map((line, index) => (/-\s*model_name:/.test(line) ? index : -1))
    .filter((index) => index !== -1);

  return startIndices.map((start, position) => {
    const end = startIndices[position + 1] ?? section.length;
    return section.slice(start, end).join('\n');
  });
}

describe('create-ragen-app LLM examples match infra/litellm/config.yaml', () => {
  const entries = modelListEntries(readFileSync(CONFIG_PATH, 'utf8'));

  it('finds model_list entries, so a broken split cannot pass vacuously', () => {
    expect(entries.length).toBeGreaterThan(3);
  });

  it.each(Object.entries(LLM_PROVIDERS))(
    '%s: model_name, model and api_key env var all belong to the same config.yaml entry',
    (_choice, provider) => {
      const matchingEntry = entries.find(
        (entry) =>
          entry.includes(`model_name: ${provider.modelName}`) &&
          entry.includes(`model: ${provider.litellmModel}`) &&
          entry.includes(`api_key: os.environ/${provider.apiKeyEnvVar}`),
      );

      expect(
        matchingEntry,
        `No entry in config.yaml has model_name "${provider.modelName}", model "${provider.litellmModel}" and api_key "os.environ/${provider.apiKeyEnvVar}" together — update its commented example alongside packages/create-ragen-app/src/llm-provider.ts.`,
      ).toBeDefined();
    },
  );
});
