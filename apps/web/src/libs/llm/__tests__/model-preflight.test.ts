import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MissingCredentialsError,
  UnknownModelError,
} from '@ragenai/llm-gateway';

const resolveModel = vi.hoisted(() => vi.fn(async () => ({ id: 'model' })));
const gatewayFromEnv = vi.hoisted(() => vi.fn(() => ({ resolveModel })));

vi.mock('@ragenai/llm-gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ragenai/llm-gateway')>();
  return { ...actual, gatewayFromEnv };
});

import { ModelNotConfiguredError } from '@/libs/chains/errors';
import {
  asModelNotConfigured,
  assertModelIsServed,
  modelForTurn,
} from '../model-preflight';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertModelIsServed', () => {
  it('passes a model the gateway can resolve', async () => {
    await expect(
      assertModelIsServed('gpt-4o-mini', { organizationId: 'org-1' }),
    ).resolves.toBeUndefined();

    expect(resolveModel).toHaveBeenCalledWith('gpt-4o-mini', {
      scope: { organizationId: 'org-1' },
    });
  });

  /**
   * The case that was found on a Railway install holding only an OpenRouter
   * key: the turn's model routed to Vertex, and the failure surfaced inside the
   * stream as an empty answer.
   */
  it('refuses a model whose provider has no credentials, naming what to set', async () => {
    resolveModel.mockRejectedValueOnce(
      new MissingCredentialsError('vertex', [
        'VERTEX_PROJECT',
        'VERTEX_LOCATION',
      ]),
    );

    const error = await assertModelIsServed('gemini-3-flash-preview').catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ModelNotConfiguredError);
    expect(error).toMatchObject({
      code: 'model-not-configured',
      modelId: 'gemini-3-flash-preview',
      originalErrorMessage:
        'gemini-3-flash-preview: no credentials for vertex: set VERTEX_PROJECT, VERTEX_LOCATION',
    });
  });

  it('carries variable names and never their values', async () => {
    process.env.VERTEX_PROJECT = 'secret-project-id';
    try {
      resolveModel.mockRejectedValueOnce(
        new MissingCredentialsError('vertex', ['VERTEX_LOCATION']),
      );

      const error = (await assertModelIsServed('gemini-3-flash-preview').catch(
        (caught: unknown) => caught,
      )) as ModelNotConfiguredError;

      expect(error.originalErrorMessage).not.toContain('secret-project-id');
      expect(error.message).not.toContain('secret-project-id');
    } finally {
      delete process.env.VERTEX_PROJECT;
    }
  });

  it('refuses a model with no route at all', async () => {
    resolveModel.mockRejectedValueOnce(new UnknownModelError('made-up-model'));

    await expect(assertModelIsServed('made-up-model')).rejects.toMatchObject({
      code: 'model-not-configured',
      originalErrorMessage: 'made-up-model: no route for model "made-up-model"',
    });
  });

  it('lets any other failure through unchanged', async () => {
    const malformed = new Error('VERTEX_CREDENTIALS is not valid JSON');
    resolveModel.mockRejectedValueOnce(malformed);

    await expect(assertModelIsServed('gemini-3-flash-preview')).rejects.toBe(
      malformed,
    );
  });

  it('leaves an empty model id to the chain, which refuses it itself', async () => {
    await expect(assertModelIsServed(undefined)).resolves.toBeUndefined();

    expect(gatewayFromEnv).not.toHaveBeenCalled();
  });

  it('passes no scope when there is no organization', async () => {
    await assertModelIsServed('gpt-4o-mini');

    expect(resolveModel).toHaveBeenCalledWith('gpt-4o-mini', {
      scope: undefined,
    });
  });
});

describe('asModelNotConfigured', () => {
  it('returns nothing for an unrelated error', () => {
    expect(asModelNotConfigured(new Error('boom'), 'x')).toBeUndefined();
  });

  it('returns an existing refusal as it is', () => {
    const refusal = new ModelNotConfiguredError('x', 'detail');

    expect(asModelNotConfigured(refusal, 'y')).toBe(refusal);
  });
});

/**
 * A turn with images on a text-only model is answered by the vision fallback,
 * inside the stream. The preflight has to check that model, not the one the
 * thread asked for.
 */
describe('a turn with images', () => {
  beforeEach(() => {
    vi.stubEnv('MULTIMODAL_TEXT_ONLY_MODELS', 'text-only-model');
    vi.stubEnv('MULTIMODAL_FALLBACK_MODEL', 'gemini-3-flash-preview');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('checks the vision fallback, and names it when its provider has no keys', async () => {
    resolveModel.mockRejectedValueOnce(
      new MissingCredentialsError('vertex', [
        'VERTEX_PROJECT',
        'VERTEX_LOCATION',
      ]),
    );

    await expect(
      assertModelIsServed('text-only-model', { hasImages: true }),
    ).rejects.toMatchObject({
      code: 'model-not-configured',
      modelId: 'gemini-3-flash-preview',
    });
    expect(resolveModel).toHaveBeenCalledWith(
      'gemini-3-flash-preview',
      expect.anything(),
    );
  });

  it('does not refuse a turn the fallback can answer', async () => {
    await expect(
      assertModelIsServed('text-only-model', { hasImages: true }),
    ).resolves.toBeUndefined();

    expect(resolveModel).toHaveBeenCalledTimes(1);
    expect(resolveModel).not.toHaveBeenCalledWith(
      'text-only-model',
      expect.anything(),
    );
  });

  it('checks the requested model when the turn has no images', async () => {
    await assertModelIsServed('text-only-model', { hasImages: false });

    expect(resolveModel).toHaveBeenCalledWith(
      'text-only-model',
      expect.anything(),
    );
  });

  it('keeps a model that is not listed as text-only', () => {
    expect(modelForTurn('vision-model', true)).toBe('vision-model');
  });

  it('swaps nothing when no fallback is configured', () => {
    vi.stubEnv('MULTIMODAL_FALLBACK_MODEL', '');

    expect(modelForTurn('text-only-model', true)).toBe('text-only-model');
  });
});
