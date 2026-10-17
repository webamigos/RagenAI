import { describe, expect, it } from 'vitest';

import {
  findModelServerProblems,
  probedModels,
} from '../find-model-server-problems';

describe('probedModels', () => {
  it('maps each selected model to the variables that select it', () => {
    expect(
      probedModels({
        DEFAULT_MODEL: 'local-chat',
        REPHRASE_MODEL: 'local-small',
        SUMMARY_MODEL: ' local-small ',
        EMBEDDINGS_MODEL: '',
        SELECTION_MODEL: 'not-probed',
      }),
    ).toEqual(
      new Map([
        ['local-chat', ['DEFAULT_MODEL']],
        ['local-small', ['REPHRASE_MODEL', 'SUMMARY_MODEL']],
      ]),
    );
  });
});

describe('findModelServerProblems', () => {
  const selectedBy = new Map([
    ['local-chat', ['DEFAULT_MODEL']],
    ['local-small', ['REPHRASE_MODEL', 'SUMMARY_MODEL']],
    ['vllm-chat', ['DEFAULT_MODEL']],
  ]);

  it('says nothing when every probed model is there or was not probed', () => {
    expect(
      findModelServerProblems(
        [
          { modelId: 'local-chat', state: 'ok', connection: 'ollama' },
          { modelId: 'gpt-5.4', state: 'not-probed' },
        ],
        selectedBy,
      ),
    ).toEqual([]);
  });

  it('names each server that does not answer once, by its variable', () => {
    const [finding] = findModelServerProblems(
      [
        { modelId: 'local-chat', state: 'unreachable', connection: 'ollama' },
        { modelId: 'local-small', state: 'unreachable', connection: 'ollama' },
        { modelId: 'vllm-chat', state: 'unreachable', connection: 'vllm' },
      ],
      selectedBy,
    );

    expect(finding).toEqual({
      id: 'model-server-unreachable',
      severity: 'recommended',
      vars: ['LLM_OLLAMA_BASE_URL', 'LLM_VLLM_BASE_URL'],
      values: { connections: 'ollama, vllm' },
      // The key goes in only when it is set: a server that wants one answers
      // 401 to a bare request, which would read as "down".
      example:
        'K=$LLM_OLLAMA_API_KEY; curl ${K:+-H "Authorization: Bearer $K"} "$LLM_OLLAMA_BASE_URL/models"; ' +
        'K=$LLM_VLLM_API_KEY; curl ${K:+-H "Authorization: Bearer $K"} "$LLM_VLLM_BASE_URL/models"',
    });
  });

  it('lists the models to pull, with the variables that select them', () => {
    const [finding] = findModelServerProblems(
      [
        {
          modelId: 'local-small',
          state: 'missing',
          connection: 'ollama',
          upstreamModel: 'qwen2.5:7b-instruct',
        },
      ],
      selectedBy,
    );

    expect(finding).toEqual({
      id: 'model-not-pulled',
      severity: 'recommended',
      vars: ['REPHRASE_MODEL', 'SUMMARY_MODEL'],
      values: { models: 'qwen2.5:7b-instruct' },
      example: 'ollama pull qwen2.5:7b-instruct',
    });
  });

  it('tells a server that is down apart from a model that is missing', () => {
    const findings = findModelServerProblems(
      [
        { modelId: 'vllm-chat', state: 'unreachable', connection: 'vllm' },
        {
          modelId: 'local-small',
          state: 'missing',
          connection: 'ollama',
          upstreamModel: 'qwen2.5:7b-instruct',
        },
      ],
      selectedBy,
    );

    expect(findings.map((f) => f.id)).toEqual([
      'model-server-unreachable',
      'model-not-pulled',
    ]);
  });

  it('gives `ollama pull` only for Ollama, and a load instruction elsewhere', () => {
    const [finding] = findModelServerProblems(
      [
        {
          modelId: 'local-small',
          state: 'missing',
          connection: 'ollama',
          upstreamModel: 'qwen2.5:7b-instruct',
        },
        {
          modelId: 'vllm-chat',
          state: 'missing',
          connection: 'vllm',
          upstreamModel: 'meta-llama/Llama-3.3-70B',
        },
      ],
      selectedBy,
    );

    expect(finding?.example).toBe(
      'ollama pull qwen2.5:7b-instruct && # load meta-llama/Llama-3.3-70B on the vllm server',
    );
  });

  it('keeps the proxy-era key fallback in the scaleway command', () => {
    const [finding] = findModelServerProblems(
      [{ modelId: 'x', state: 'unreachable', connection: 'scaleway' }],
      selectedBy,
    );

    expect(finding?.example).toBe(
      'K=${LLM_SCALEWAY_API_KEY:-$SCW_API_KEY}; curl ${K:+-H "Authorization: Bearer $K"} "$LLM_SCALEWAY_BASE_URL/models"',
    );
  });
});
