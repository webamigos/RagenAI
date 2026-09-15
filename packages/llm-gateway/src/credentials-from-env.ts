import { readFileSync } from 'node:fs';

import type {
  CredentialScope,
  CredentialSource,
  ProviderCredentials,
  ProviderId,
} from './types';

export class MissingCredentialsError extends Error {
  constructor(provider: ProviderId, missing: readonly string[]) {
    super(`no credentials for ${provider}: set ${missing.join(', ')}`);
    this.name = 'MissingCredentialsError';
  }
}

/**
 * Environment-variable names are the ones `infra/litellm/config.yaml` already
 * uses, so a deployment that runs the proxy today needs no new secrets to run
 * the gateway — the two read the same variables and can be compared directly
 * while the flag still chooses between them.
 */
const REQUIRED: Record<Exclude<ProviderId, 'openai-compatible'>, string[]> = {
  azure: ['AZURE_API_KEY', 'AZURE_API_BASE'],
  bedrock: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_BEDROCK_REGION'],
  vertex: ['VERTEX_PROJECT', 'VERTEX_LOCATION'],
  // One variable, and the base URL is optional — the whole point of having
  // this family separate from `openai-compatible` is that a deployment with
  // just an OpenAI key configures nothing else.
  openai: ['OPENAI_API_KEY'],
};

/**
 * An OpenAI-compatible upstream is named, and its variables are derived from
 * that name rather than listed here. That is what makes Q6's promise true: a
 * deployment adds vLLM, Ollama, TGI or its own LiteLLM by writing a route and
 * two environment variables, with no change to this package.
 *
 * `scaleway` reads `LLM_SCALEWAY_BASE_URL` / `LLM_SCALEWAY_API_KEY`, falling
 * back to the proxy's existing `SCW_API_BASE` / `SCW_API_KEY` so the one
 * connection that exists today keeps working unchanged.
 */
function connectionEnvNames(connection: string): {
  baseUrl: string[];
  apiKey: string[];
  headers: string[];
} {
  const slug = connection.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const names = {
    baseUrl: [`LLM_${slug}_BASE_URL`],
    apiKey: [`LLM_${slug}_API_KEY`],
    headers: [`LLM_${slug}_HEADERS`],
  };
  if (connection === 'scaleway') {
    names.baseUrl.push('SCW_API_BASE');
    names.apiKey.push('SCW_API_KEY');
  }
  return names;
}

/**
 * The service account in `VERTEX_CREDENTIALS`, if there is one.
 *
 * The proxy accepts either the JSON itself or a path to it, so both are handled
 * here — a deployment that already runs LiteLLM has one of the two set and
 * should not have to learn a third convention to try the gateway.
 *
 * Returns `undefined` rather than throwing when the variable is unset: Google's
 * application default credentials are a perfectly good way to authenticate
 * (a GCE/Cloud Run service identity supplies them with no variable at all), and
 * this is the one provider where "no credentials configured" is routinely
 * correct. Malformed content is a different matter and does throw — a blob that
 * cannot be parsed is a misconfiguration, and falling through to ADC would
 * report it as an unrelated permissions error much later.
 */
function serviceAccountFromEnv(): Record<string, unknown> | undefined {
  const raw = process.env.VERTEX_CREDENTIALS?.trim();
  if (!raw) {
    return undefined;
  }

  const json = raw.startsWith('{') ? raw : readCredentialsFile(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (cause) {
    throw new Error(
      `VERTEX_CREDENTIALS is not valid JSON: ${(cause as Error).message}`,
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('VERTEX_CREDENTIALS must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function readCredentialsFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (cause) {
    throw new Error(
      `VERTEX_CREDENTIALS points at ${path}, which cannot be read: ${(cause as Error).message}`,
    );
  }
}

/**
 * Extra headers for a connection, as a JSON object.
 *
 * JSON rather than `k=v,k=v` because header values contain commas, equals signs
 * and spaces routinely, and a format that cannot express its own content is
 * worse than a slightly awkward one. `VERTEX_CREDENTIALS` is already JSON here,
 * so an operator has met the convention.
 *
 * Malformed content throws rather than being ignored: a header that silently
 * failed to apply would route traffic to the wrong upstream, or bill it to the
 * wrong account, with nothing to read in either case.
 */
function headersFromEnv(name: string): Record<string, string> | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(
      `${name} must be a JSON object of headers: ${(cause as Error).message}`,
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object of headers`);
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  for (const [key, value] of entries) {
    if (typeof value !== 'string') {
      throw new Error(
        `${name}: header "${key}" must be a string, got ${typeof value}`,
      );
    }
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function firstSet(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }
  return undefined;
}

/**
 * Deployment-wide credentials from the environment.
 *
 * `scope` is accepted and ignored: one key per provider for the whole
 * installation is what exists today. Per-organization and per-team keys are
 * the known next step and belong in ragen-token-vault, which already holds
 * per-org secrets — that is a second `CredentialSource`, not a change here.
 */
export class EnvCredentialSource implements CredentialSource {
  async forProvider(
    provider: ProviderId,
    options?: { connection?: string; scope?: CredentialScope },
  ): Promise<ProviderCredentials> {
    if (provider === 'openai-compatible') {
      const connection = options?.connection;
      if (!connection) {
        throw new MissingCredentialsError(provider, [
          'a `connection` on the route',
        ]);
      }
      const names = connectionEnvNames(connection);
      const baseUrl = firstSet(names.baseUrl);
      const apiKey = firstSet(names.apiKey);
      if (!baseUrl) {
        throw new MissingCredentialsError(provider, names.baseUrl);
      }
      return {
        baseUrl,
        apiKey,
        headers: headersFromEnv(names.headers[0]!),
      };
    }

    const required = REQUIRED[provider];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new MissingCredentialsError(provider, missing);
    }

    switch (provider) {
      case 'azure':
        return {
          apiKey: process.env.AZURE_API_KEY,
          baseUrl: process.env.AZURE_API_BASE,
          // Optional: the provider has its own default. Passed through when
          // set so a deployment pinning a version for the proxy keeps it.
          apiVersion: process.env.AZURE_API_VERSION,
        };
      case 'bedrock':
        return { region: process.env.AWS_BEDROCK_REGION };
      case 'vertex':
        return {
          project: process.env.VERTEX_PROJECT,
          location: process.env.VERTEX_LOCATION,
          serviceAccount: serviceAccountFromEnv(),
        };
      case 'openai':
        return {
          apiKey: process.env.OPENAI_API_KEY,
          // Unset means OpenAI proper. A deployment behind a gateway or a
          // regional endpoint that still speaks OpenAI's own API sets it.
          baseUrl: process.env.OPENAI_BASE_URL,
        };
    }
  }
}

/**
 * Whether this environment has what `provider` needs, without building
 * anything or throwing.
 *
 * Exists so a deployment can be asked what it can actually serve. The shipped
 * route table lists every model Ragen's own installation runs; an installation
 * with one provider's credentials should offer that provider's models and stay
 * quiet about the rest, rather than listing models that fail the moment
 * somebody picks one.
 */
export function providerIsConfigured(
  provider: ProviderId,
  connection?: string,
): boolean {
  if (provider === 'openai-compatible') {
    return connection
      ? firstSet(connectionEnvNames(connection).baseUrl) !== undefined
      : false;
  }
  return REQUIRED[provider].every((name) => Boolean(process.env[name]));
}
