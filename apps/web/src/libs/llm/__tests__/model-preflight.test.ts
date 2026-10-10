import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { asModelNotConfigured, assertModelIsServed } from '../model-preflight';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertModelIsServed', () => {
  it('passes a model the gateway can resolve', async () => {
    await expect(
      assertModelIsServed('gpt-4o-mini', 'org-1'),
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
