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
    // Not a gateway selector: `litellm` is the pricing namespace `AiUsage`
    // writes against, and the provider that actually served a turn is recorded
    // separately as `servedBy`. The flag that used to sit here went with the
    // proxy in #1194.
    'DEFAULT_MODEL_PROVIDER=litellm',
    `DEFAULT_MODEL=${config.modelName}`,
    `REPHRASE_MODEL=${config.modelName}`,
  ];

  const routeLines = [
    `  ${config.modelName}:`,
    `    provider: ${config.gatewayProvider}`,
    `    model: ${config.upstreamModel}`,
  ];

  if (config.embeddings) {
    envLines.push(
      `EMBEDDINGS_MODEL=${config.embeddings.modelName}`,
      `VECTOR_SIZE=${config.embeddings.vectorSize}`,
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
    ...(config.embeddings ? [] : secondProviderForEmbeddings(config.label)),
    '',
  ];
}

/**
 * What to add when the chosen provider serves chat and nothing else.
 *
 * Concrete rather than "add one (OpenAI, Scaleway or Cohere)", because the
 * instructions above replace the whole `routes:` block — so the shipped
 * `EMBEDDINGS_MODEL` default stops being routed at all, and the knowledge base
 * fails on the first upload with a model id nothing serves. Telling someone to
 * leave that variable alone was correct while a proxy served it and is wrong
 * now.
 *
 * OpenAI rather than a choice, for the same reason the wizard picks defaults:
 * one working recipe beats three that each need a decision. Derived from
 * `LLM_PROVIDERS.openai` so the model name and its vector size cannot drift
 * from what the wizard would have written.
 */
function secondProviderForEmbeddings(label: string): string[] {
  const openai = LLM_PROVIDERS.openai;
  const embeddings = openai.embeddings;
  if (!embeddings) {
    return [];
  }

  return [
    '',
    `${label} publishes no embeddings API, so the knowledge base needs a`,
    'second provider. Anything else with one will do; this is the shortest',
    'working version.',
    '',
    'Add to `.env.local`:',
    '',
    '```',
    `${openai.apiKeyEnvVar}=<your ${openai.label} key>`,
    `EMBEDDINGS_MODEL=${embeddings.modelName}`,
    `VECTOR_SIZE=${embeddings.vectorSize}`,
    '```',
    '',
    'And a second entry under `routes:`, beside the chat one above:',
    '',
    '```yaml',
    `  ${embeddings.modelName}:`,
    `    provider: ${openai.gatewayProvider}`,
    `    model: ${embeddings.upstreamModel}`,
    '```',
    '',
    'Without both, uploads fail on a model id nothing serves — the route table',
    'you wrote above replaced the one that used to carry a default.',
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
