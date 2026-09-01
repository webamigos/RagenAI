import { assistantId } from '../common/utils/openai-format.js';

export type ProjectWithSettings = {
  id: string;
  title: string;
  createdAt: Date | null;
  settings: { instructions: string | null } | null;
};

export type OrgDefaults = {
  model: string | null;
  temperature: number | null;
};

/**
 * OpenAI Assistant object. We implement the subset that maps onto a
 * Ragen Project. Fields without a persistent backing (description,
 * metadata, tools, tool_resources, response_format, top_p) come from
 * constants — they round-trip through create/modify without breaking
 * SDK clients but don't persist until the schema grows support.
 */
export type OpenAIAssistant = {
  id: string;
  object: 'assistant';
  created_at: number;
  name: string;
  description: string | null;
  model: string;
  instructions: string | null;
  tools: Array<{ type: 'file_search' }>;
  tool_resources: Record<string, never>;
  metadata: Record<string, never>;
  temperature: number;
  top_p: number;
  response_format: 'auto';
};

const DEFAULT_TEMPERATURE = 1.0;
const DEFAULT_MODEL = 'ragen';

export function toOpenAIAssistant(
  project: ProjectWithSettings,
  orgDefaults?: OrgDefaults,
): OpenAIAssistant {
  return {
    id: assistantId(project.id),
    object: 'assistant',
    created_at: project.createdAt
      ? Math.floor(project.createdAt.getTime() / 1000)
      : 0,
    name: project.title,
    description: null,
    model: orgDefaults?.model ?? DEFAULT_MODEL,
    instructions: project.settings?.instructions ?? null,
    tools: [{ type: 'file_search' }],
    tool_resources: {},
    metadata: {},
    temperature: orgDefaults?.temperature ?? DEFAULT_TEMPERATURE,
    top_p: 1.0,
    response_format: 'auto',
  };
}
