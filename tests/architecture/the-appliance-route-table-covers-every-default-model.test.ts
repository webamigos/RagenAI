import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { loadRouteTable } from '../../packages/llm-gateway/src/route-table';

/**
 * The appliance route table has to answer every model id the application asks
 * for, and every answer has to stay on the machine.
 *
 * An id with no route is not a harmless gap on an appliance. The gateway
 * refuses it, so the feature fails — and some of these ids are constants, not
 * env (the guardrail judge, the optimize generator, the worker's SRT segmenter),
 * so an installer has no setting to fix. A cloud route for one of them is
 * worse: it works, and the install is no longer private.
 *
 * So the list below is the application's own defaults, each with the file and
 * the literal that sets it. The test checks both halves: that the literal is
 * still in its file (a renamed default fails here instead of silently going
 * unrouted) and that the appliance table routes it.
 *
 * Phase 0 of docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const TABLE_PATH = 'infra/llm-gateway/routes.appliance.yaml';
const ENV_PATH = 'infra/appliance/appliance.env.example';

/** A model id the application uses without asking the environment. */
const HARDCODED_DEFAULTS: Array<{ id: string; file: string }> = [
  // Org default when neither DEFAULT_MODEL nor the org setting is set.
  {
    id: 'gemini-3-flash-preview',
    file: 'apps/web/src/app/components/MyProfile/ChatInstanceSettings/PublicChatModelSelect.tsx',
  },
  {
    id: 'gemini-2.5-flash',
    file: 'packages/guardrails/src/evaluator/policy.ts',
  },
  {
    id: 'gemini-2.5-flash',
    file: 'apps/web/src/app/api/knowledge/optimize/route.ts',
  },
  { id: 'gpt-oss-120b', file: 'apps/web/src/app/components/config.ts' },
  {
    id: 'gpt-5.4-nano',
    file: 'apps/worker/src/services/document-loaders/parse-srt-to-segments.ts',
  },
  { id: 'gpt-5.4-nano', file: 'apps/worker/src/utils/get-open-api-keys.ts' },
  {
    id: 'gpt-5.4-nano',
    file: 'apps/worker/src/services/chains/pdf-process-rag/config.ts',
  },
  {
    id: 'gpt-5.4-mini',
    file: 'apps/worker/src/services/chains/pdf-process-rag/config.ts',
  },
  { id: 'claude-haiku-4-5', file: 'apps/worker/src/config/env.ts' },
];

/** Env settings whose value must be a route in the appliance table. */
const MODEL_VARS = [
  'DEFAULT_MODEL',
  'REPHRASE_MODEL',
  'SUMMARY_MODEL',
  'SELECTION_MODEL',
  'BRAIN_EXTRACT_MODEL',
  'MEMORY_EXTRACT_MODEL',
  'MULTIMODAL_FALLBACK_MODEL',
  'EMBEDDINGS_MODEL',
];

/** Set to anything, each of these sends data to a third party. */
const MUST_BE_EMPTY = [
  'OPENAI_API_KEY',
  'POSTHOG_KEY',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'LANGFUSE_SECRET_KEY',
  'RESEND_API_KEY',
  'KIT_API_KEY',
  'PUSHER_APP_ID',
];

function envTemplate(): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of read(ENV_PATH).split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match?.[1]) {
      values.set(match[1], (match[2] ?? '').trim());
    }
  }
  return values;
}

const rawTable = parseYaml(read(TABLE_PATH)) as {
  routes: Record<
    string,
    {
      provider: string;
      connection?: string;
      display?: string;
      capabilities?: string[];
    }
  >;
};

/** The install's own chat routes — every `local-*` id but the embedder. */
const LOCAL_CHAT_ROUTES = ['local-chat', 'local-small', 'local-vision'];

describe('the appliance route table', () => {
  it('is a valid route table', () => {
    expect(() => loadRouteTable(rawTable)).not.toThrow();
  });

  it('serves every route from the local Ollama connection', () => {
    const leaving = Object.entries(rawTable.routes)
      .filter(
        ([, route]) =>
          route.provider !== 'openai-compatible' ||
          route.connection !== 'ollama',
      )
      .map(([id]) => id);

    expect(leaving).toEqual([]);
  });

  it.each(HARDCODED_DEFAULTS)(
    'routes $id, which $file uses',
    ({ id, file }) => {
      expect(read(file)).toContain(`'${id}'`);
      expect(Object.keys(rawTable.routes)).toContain(id);
    },
  );

  // The picker offers a described route only with `chat` (Phase A2). The
  // install's own chat models must be offered, under a name; an alias of a
  // hardcoded cloud id must not be, or the picker lists one local model under
  // several names.
  it.each(LOCAL_CHAT_ROUTES)('names %s and offers it for chat', (id) => {
    expect(Object.keys(rawTable.routes)).toContain(id);
    expect(rawTable.routes[id]?.display).toBeTruthy();
    expect(rawTable.routes[id]?.capabilities).toContain('chat');
  });

  // A new `local-*` route is a chat route unless it is the embedder, so it has
  // to join the list above and be checked like the others.
  it('has no local route that is neither a chat route nor the embedder', () => {
    const unlisted = Object.keys(rawTable.routes).filter(
      (id) =>
        id.startsWith('local-') &&
        id !== 'local-embed' &&
        !LOCAL_CHAT_ROUTES.includes(id),
    );
    expect(unlisted).toEqual([]);
  });

  it('names the embedder without offering it', () => {
    expect(rawTable.routes['local-embed']?.display).toBeTruthy();
    expect(rawTable.routes['local-embed']?.capabilities ?? []).toEqual([]);
  });

  it.each([...new Set(HARDCODED_DEFAULTS.map(({ id }) => id))])(
    'keeps the %s alias out of the picker',
    (id) => {
      expect(rawTable.routes[id]?.display).toBeTruthy();
      expect(rawTable.routes[id]?.capabilities).toBeUndefined();
    },
  );
});

describe('the appliance env template', () => {
  const env = envTemplate();

  it.each(MODEL_VARS)('names a routed model in %s', (name) => {
    const value = env.get(name);
    expect(value, `${name} is not set in ${ENV_PATH}`).toBeTruthy();
    expect(Object.keys(rawTable.routes)).toContain(value);
  });

  it('points at the appliance table by an absolute path', () => {
    const path = env.get('LLM_ROUTES_PATH') ?? '';
    expect(path.startsWith('/')).toBe(true);
    expect(path.endsWith(TABLE_PATH)).toBe(true);
  });

  it('keeps ingest from falling back to a cloud parser', () => {
    expect(env.get('DOCLING_STRICT')).toBe('1');
  });

  it('sets the vector size the local embedder produces', () => {
    expect(env.get('VECTOR_SIZE')).toBe('1024');
  });

  it.each(MUST_BE_EMPTY)('leaves %s empty', (name) => {
    expect(env.get(name) ?? '').toBe('');
  });
});
