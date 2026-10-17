import { describe, expect, it } from 'vitest';

import { readSource, trackedFiles } from './tracked-files';

/**
 * A model provider's SDK is imported by `packages/llm-gateway` and nowhere
 * else.
 *
 * The route table is what decides where a model call goes (ADR-49), and on an
 * on-premises appliance it is also the only thing standing between a model
 * call and the internet: `infra/llm-gateway/routes.appliance.yaml` sends every
 * id to a local server. A provider client built anywhere else ignores that
 * table entirely — it reaches its vendor whatever the install was configured
 * to do, and nothing in the route-table tests can see it.
 *
 * Exceptions are listed with their reason. Adding one should be as visible in
 * review as the import it excuses.
 */

const PROVIDER_SDK =
  /(?:from\s+|require\(\s*|import\(\s*)['"](openai|@anthropic-ai\/sdk|@ai-sdk\/(?:openai|anthropic|google|google-vertex|amazon-bedrock|azure|mistral|cohere|openai-compatible)|@openrouter\/[a-z-]+|cohere-ai|@mistralai\/[a-z-]+)['"]/;

const ALLOWED: Record<string, string> = {
  // OpenAI's moderation endpoint is not a model the route table can serve,
  // and no other provider offers it. It is only built when an organization
  // enables content moderation *and* an OpenAI key is set; with no key it is
  // reported as not configured and the turn passes, so an appliance — which
  // sets no key — never reaches it.
  'apps/web/src/app/lib/services/llm.ts': 'OpenAI moderation, key-gated',
  'apps/api/src/chains/moderation-instance.ts': 'OpenAI moderation, key-gated',
};

describe('model providers are reached through the gateway', () => {
  const sources = trackedFiles({
    under: ['apps', 'packages'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    skipDirs: ['node_modules', '__tests__', 'dist', '.next', 'generated'],
    relativePaths: true,
  }).filter((file) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file));

  it('found the app sources', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('imports a provider SDK only inside packages/llm-gateway', () => {
    const offenders = sources.filter(
      (file) =>
        !file.startsWith('packages/llm-gateway/') &&
        !(file in ALLOWED) &&
        PROVIDER_SDK.test(readSource(file)),
    );

    expect(
      offenders,
      'Resolve the model through @ragenai/llm-gateway, or add the file to ALLOWED with the reason it cannot',
    ).toEqual([]);
  });

  it('has no stale exception', () => {
    // An exception for a file that no longer imports a provider is a licence
    // waiting for the next import.
    const stale = Object.keys(ALLOWED).filter(
      (file) => !sources.includes(file) || !PROVIDER_SDK.test(readSource(file)),
    );

    expect(stale).toEqual([]);
  });
});
