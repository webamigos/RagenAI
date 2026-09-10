/**
 * Wires a plain OpenAI or Anthropic API key into `infra/litellm/config.yaml`
 * by inserting a new `model_list` entry as text, not by parsing and
 * re-serializing the YAML. The shipped config is heavily hand-commented
 * (rationale for every model, dated notes, links) and a round-trip through a
 * YAML library would collapse or reorder all of that — a text splice right
 * after the `model_list:` key preserves everything else byte-for-byte.
 */

export interface LiteLLMModelEntry {
  modelName: string;
  /** LiteLLM provider-prefixed model id, e.g. "openai/gpt-4o-mini". */
  model: string;
  /** Name of the env var holding the API key, e.g. "OPENAI_API_KEY". */
  apiKeyEnvVar: string;
}

export function addLiteLLMModel(
  configText: string,
  entry: LiteLLMModelEntry,
): string {
  const lines = configText.split('\n');
  const anchorIndex = lines.findIndex((line) => line.trim() === 'model_list:');

  if (anchorIndex === -1) {
    throw new Error(
      'infra/litellm/config.yaml has no `model_list:` key — cannot insert a model entry.',
    );
  }

  const entryLines = [
    `  - model_name: ${entry.modelName}`,
    '    litellm_params:',
    `      model: ${entry.model}`,
    `      api_key: os.environ/${entry.apiKeyEnvVar}`,
    '',
  ];

  lines.splice(anchorIndex + 1, 0, ...entryLines);
  return lines.join('\n');
}
