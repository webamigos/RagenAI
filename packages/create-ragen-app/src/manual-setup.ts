import { LLM_PROVIDERS, type LlmProviderChoice } from './llm-provider';

/**
 * What to write by hand when the wizard did not take an API key.
 *
 * Pasting a provider key into someone else's CLI is a reasonable thing to
 * refuse, so skipping has to leave a person able to finish the job rather
 * than a one-line "chat will not work". The text is generated from
 * `LLM_PROVIDERS`, not written out twice, so the instructions cannot drift
 * from what the wizard itself would have configured.
 */

const SELF_HOSTING_DOCS = 'https://docs.ragen.ai/docs/self-hosting';

function providerSection(choice: LlmProviderChoice): string[] {
  const config = LLM_PROVIDERS[choice];

  const envLines = [
    `${config.apiKeyEnvVar}=<your ${config.label} key>`,
    // The wizard writes this, so the guide must too — otherwise following it
    // by hand produces a proxy install where the wizard produces a direct one.
    'LLM_GATEWAY=native',
    'DEFAULT_MODEL_PROVIDER=litellm',
    `DEFAULT_MODEL=${config.modelName}`,
    `REPHRASE_MODEL=${config.modelName}`,
  ];

  const routeLines = [
    `  ${config.modelName}:`,
    `    provider: ${config.gatewayProvider}`,
    `    model: ${config.upstreamModel}`,
  ];

  const yamlLines = [
    `  - model_name: ${config.modelName}`,
    '    litellm_params:',
    `      model: ${config.litellmModel}`,
    `      api_key: os.environ/${config.apiKeyEnvVar}`,
  ];

  if (config.embeddings) {
    envLines.push(
      `EMBEDDINGS_MODEL=${config.embeddings.modelName}`,
      `VECTOR_SIZE=${config.embeddings.vectorSize}`,
    );
    yamlLines.push(
      `  - model_name: ${config.embeddings.modelName}`,
      '    litellm_params:',
      `      model: ${config.embeddings.litellmModel}`,
      `      api_key: os.environ/${config.apiKeyEnvVar}`,
    );
    routeLines.push(
      `  ${config.embeddings.modelName}:`,
      `    provider: ${config.gatewayProvider}`,
      `    model: ${config.embeddings.upstreamModel}`,
    );
  }

  return [
    `### ${config.label}`,
    '',
    '`.env.local` (repository root):',
    '',
    '```',
    ...envLines,
    '```',
    '',
    '`infra/llm-gateway/routes.yaml` — replace the `routes:` block with:',
    '',
    '```yaml',
    'routes:',
    ...routeLines,
    '```',
    '',
    'The table shipped in the repository routes to Azure, Bedrock, Vertex and',
    'Scaleway. Those entries are not wrong, they are simply not yours.',
    '',
    `<details><summary>Prefer to run a proxy instead?</summary>`,
    '',
    'Set `LLM_GATEWAY=litellm` rather than `native`, leave the route table',
    'alone, and add this under the existing `model_list:` key in',
    '`infra/litellm/config.yaml`:',
    '',
    '```yaml',
    ...yamlLines,
    '```',
    '',
    'Then `docker compose restart litellm`.',
    '',
    '</details>',
    ...(config.embeddings
      ? []
      : [
          '',
          `${config.label} has no embeddings API, so the knowledge base needs a`,
          'second provider. Leave `EMBEDDINGS_MODEL` and `VECTOR_SIZE` alone and',
          'add one (OpenAI, Scaleway or Cohere) before uploading documents.',
        ]),
    '',
  ];
}

export function manualLlmSetupInstructions(): string {
  return [
    '# Configure a chat model',
    '',
    'This installation has no LLM provider yet, so chat and the knowledge',
    'base will not work until one is configured. Nothing here needs to go',
    'through a CLI — edit the two files below yourself.',
    '',
    'Ragen calls providers directly by default, so the two files are your',
    '`.env.local` and the route table. Pick one provider, apply both edits,',
    'and restart the apps.',
    '',
    ...providerSection('openai'),
    ...providerSection('anthropic'),
    '## Before you upload anything',
    '',
    '`VECTOR_SIZE` must match the embedding model **before** the first',
    "document is indexed. Qdrant fixes a collection's dimensionality when it",
    'is created, so changing it later means deleting the collections and',
    're-indexing everything.',
    '',
    '## Check it worked',
    '',
    'One real call per model this installation is configured to use:',
    '',
    '```bash',
    'npm run gateway:preflight -- --probe',
    '```',
    '',
    'It resolves each model and calls it. "Configured" and "works" are',
    'different questions, and only the second one matters here.',
    '',
    `Anything else — S3 storage, encryption at rest, Stripe, email, MCP`,
    `connectors — is documented at ${SELF_HOSTING_DOCS}.`,
    '',
  ].join('\n');
}
