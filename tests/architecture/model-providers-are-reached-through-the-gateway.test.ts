import { describe, expect, it } from 'vitest';

import { readSource, trackedFiles } from './tracked-files';

/**
 * A model provider is reached through `packages/llm-gateway` and nowhere else.
 *
 * The route table is what decides where a model call goes (ADR-49), and on an
 * on-premises appliance it is also the only thing standing between a model
 * call and the internet: `infra/llm-gateway/routes.appliance.yaml` sends every
 * id to a local server. A provider client built anywhere else — or a plain
 * HTTP call to a provider's endpoint — ignores that table entirely: it reaches
 * its vendor whatever the install was configured to do, and nothing in the
 * route-table tests can see it.
 *
 * Two checks, because there are two ways around the gateway: importing a
 * provider SDK, and writing a provider's endpoint into the code. Exceptions are
 * listed with their reason and name exactly what they may do; the rest of the
 * file is still checked. Adding one should be as visible in review as the code
 * it excuses.
 */

const PROVIDER_SDK = new RegExp(
  String.raw`(?:from\s+|require\(\s*|import\(\s*)['"]` +
    String.raw`(openai|@anthropic-ai/sdk|@google/genai|@google/generative-ai|cohere-ai|` +
    String.raw`@ai-sdk/(?:openai|anthropic|google|google-vertex|amazon-bedrock|azure|mistral|cohere|openai-compatible)|` +
    String.raw`@openrouter/[a-z-]+|@mistralai/[a-z-]+)['"]`,
  'g',
);

/** A provider endpoint in a string literal — not in a comment. */
const PROVIDER_ENDPOINT = new RegExp(
  String.raw`['"\x60]https?://(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|` +
    String.raw`[a-z0-9-]*aiplatform\.googleapis\.com|api\.mistral\.ai|api\.cohere\.(?:com|ai)|` +
    String.raw`(?:eu\.)?openrouter\.ai|api\.scaleway\.ai|bedrock-runtime\.[a-z0-9-]+\.amazonaws\.com)`,
  'g',
);

type Exception = {
  reason: string;
  /** The SDK imports this file may make, by specifier. */
  sdk?: string[];
  /** The provider hosts this file may name in a literal. */
  endpoints?: string[];
};

const ALLOWED: Record<string, Exception> = {
  // OpenAI's moderation endpoint is not a model the route table can serve,
  // and no other provider offers it. It is only built when an organization
  // enables content moderation *and* an OpenAI key is set; with no key it is
  // reported as not configured and the turn passes, so an appliance — which
  // sets no key — never reaches it.
  'apps/web/src/app/lib/services/llm.ts': {
    reason: 'OpenAI moderation, key-gated',
    sdk: ['openai'],
  },
  'apps/api/src/chains/moderation-instance.ts': {
    reason: 'OpenAI moderation, key-gated',
    sdk: ['openai'],
  },
  // Speech-to-text is not a chat or embedding model and has no route. Used
  // only with SPEECH_PROVIDER=openai, and SPEECH_BASE_URL points it at a local
  // Whisper-compatible server instead.
  'apps/web/src/libs/speech/openai-provider.ts': {
    reason: 'speech default base URL, overridable',
    endpoints: ['api.openai.com'],
  },
  // The installer's prompts and placeholder text, shown to the operator.
  'packages/create-ragen-app/src/llm-provider.ts': {
    reason: 'installer prompt text',
    endpoints: ['api.scaleway.ai'],
  },
};

const matches = (pattern: RegExp, text: string) =>
  [...text.matchAll(pattern)].map((match) => match[1]!);

describe('model providers are reached through the gateway', () => {
  const sources = trackedFiles({
    under: ['apps', 'packages'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    skipDirs: ['node_modules', '__tests__', 'dist', '.next', 'generated'],
    relativePaths: true,
  }).filter(
    (file) =>
      !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file) &&
      !file.startsWith('packages/llm-gateway/'),
  );

  it('found the app sources', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('imports a provider SDK only inside packages/llm-gateway', () => {
    const offenders = sources.flatMap((file) =>
      matches(PROVIDER_SDK, readSource(file))
        .filter((sdk) => !ALLOWED[file]?.sdk?.includes(sdk))
        .map((sdk) => `${file}: ${sdk}`),
    );

    expect(
      offenders,
      'Resolve the model through @ragenai/llm-gateway, or add the file and the import to ALLOWED with the reason',
    ).toEqual([]);
  });

  it('names a provider endpoint only inside packages/llm-gateway', () => {
    const offenders = sources.flatMap((file) =>
      matches(PROVIDER_ENDPOINT, readSource(file))
        .filter((host) => !ALLOWED[file]?.endpoints?.includes(host))
        .map((host) => `${file}: ${host}`),
    );

    expect(
      offenders,
      'Call the model through @ragenai/llm-gateway, or add the file and the host to ALLOWED with the reason',
    ).toEqual([]);
  });

  it('has no stale exception', () => {
    // An exception for a file that no longer does what it excuses is a
    // licence waiting for the next import.
    const stale = Object.entries(ALLOWED).flatMap(([file, exception]) => {
      if (!sources.includes(file)) {
        return [`${file}: not found`];
      }
      const text = readSource(file);
      const sdk = new Set(matches(PROVIDER_SDK, text));
      const hosts = new Set(matches(PROVIDER_ENDPOINT, text));
      return [
        ...(exception.sdk ?? []).filter((name) => !sdk.has(name)),
        ...(exception.endpoints ?? []).filter((host) => !hosts.has(host)),
      ].map((what) => `${file}: ${what}`);
    });

    expect(stale).toEqual([]);
  });
});
