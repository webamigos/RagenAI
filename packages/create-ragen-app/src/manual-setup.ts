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
    'DEFAULT_MODEL_PROVIDER=litellm',
    `DEFAULT_MODEL=${config.modelName}`,
    `REPHRASE_MODEL=${config.modelName}`,
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
    '`infra/litellm/config.yaml`, under the existing `model_list:` key:',
    '',
    '```yaml',
    ...yamlLines,
    '```',
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
    'Pick one provider, apply both edits, then restart the proxy:',
    '',
    '```bash',
    'docker compose restart litellm',
    '```',
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
    '```bash',
    'curl -s -H "Authorization: Bearer $LITELLM_MASTER_KEY" \\',
    '  http://localhost:4000/v1/models',
    '```',
    '',
    `Anything else — S3 storage, encryption at rest, Stripe, email, MCP`,
    `connectors — is documented at ${SELF_HOSTING_DOCS}.`,
    '',
  ].join('\n');
}
