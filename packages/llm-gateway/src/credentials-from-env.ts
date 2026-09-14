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
} {
  const slug = connection.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const names = {
    baseUrl: [`LLM_${slug}_BASE_URL`],
    apiKey: [`LLM_${slug}_API_KEY`],
  };
  if (connection === 'scaleway') {
    names.baseUrl.push('SCW_API_BASE');
    names.apiKey.push('SCW_API_KEY');
  }
  return names;
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
      return { baseUrl, apiKey };
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
        };
      case 'bedrock':
        return { region: process.env.AWS_BEDROCK_REGION };
      case 'vertex':
        return {
          project: process.env.VERTEX_PROJECT,
          location: process.env.VERTEX_LOCATION,
        };
    }
  }
}
