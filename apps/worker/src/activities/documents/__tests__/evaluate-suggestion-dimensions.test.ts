/* eslint-disable no-var */
var mockGenerateObject: jest.Mock;
var mockGetChatModelForOrg: jest.Mock;
var mockWithLangfuseTrace: jest.Mock;
/* eslint-enable no-var */

jest.mock('ai', () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));
jest.mock('../../../services/llm/provider', () => ({
  getChatModelForOrg: (...args: unknown[]) => mockGetChatModelForOrg(...args),
}));
jest.mock('../../../services/langfuse-trace', () => ({
  withLangfuseTrace: (...args: unknown[]) => mockWithLangfuseTrace(...args),
}));

import { evaluateSuggestionDimensions } from '../evaluate-suggestion-dimensions';

const dimensionResult = (improved: boolean) => ({
  object: { improved, confidence: 'high' as const, reason: 'test reason' },
});

describe('evaluateSuggestionDimensions', () => {
  beforeEach(() => {
    mockGenerateObject = jest.fn().mockResolvedValue(dimensionResult(true));
    mockGetChatModelForOrg = jest.fn().mockResolvedValue('model');
    mockWithLangfuseTrace = jest.fn((_: unknown, fn: () => unknown) => fn());
  });

  it('wywołuje tylko relewantne wymiary dla type=restructure', async () => {
    await evaluateSuggestionDimensions({
      before: 'stary tekst',
      after: 'nowy tekst',
      suggestionType: 'restructure',
      orgId: 'org-1',
    });

    // restructure → chunkStructure, avgChunkSize, selfContainedness = 3 calls
    expect(mockGenerateObject).toHaveBeenCalledTimes(3);
  });

  it('wywołuje tylko relewantne wymiary dla type=keywords', async () => {
    await evaluateSuggestionDimensions({
      before: 'stary tekst',
      after: 'nowy tekst',
      suggestionType: 'keywords',
      orgId: 'org-1',
    });

    // keywords → entityDensity = 1 call
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it('zwraca tylko wymiary z improved=true', async () => {
    mockGenerateObject
      .mockResolvedValueOnce(dimensionResult(true)) // chunkStructure
      .mockResolvedValueOnce(dimensionResult(false)) // avgChunkSize
      .mockResolvedValueOnce(dimensionResult(true)); // selfContainedness

    const result = await evaluateSuggestionDimensions({
      before: 'stary tekst',
      after: 'nowy tekst',
      suggestionType: 'restructure',
      orgId: 'org-1',
    });

    expect(result.chunkStructure).toBeDefined();
    expect(result.avgChunkSize).toBeUndefined();
    expect(result.selfContainedness).toBeDefined();
  });

  it('nie rzuca błędu gdy jeden call się posypie — zwraca pozostałe wymiary', async () => {
    mockGenerateObject
      .mockRejectedValueOnce(new Error('LLM error')) // chunkStructure fail
      .mockResolvedValueOnce(dimensionResult(true)) // avgChunkSize ok
      .mockResolvedValueOnce(dimensionResult(true)); // selfContainedness ok

    const result = await evaluateSuggestionDimensions({
      before: 'stary tekst',
      after: 'nowy tekst',
      suggestionType: 'restructure',
      orgId: 'org-1',
    });

    expect(result.chunkStructure).toBeUndefined();
    expect(result.avgChunkSize).toBeDefined();
    expect(result.selfContainedness).toBeDefined();
  });

  it('zwraca pusty obiekt gdy wszystkie calle się posypią', async () => {
    mockGenerateObject.mockRejectedValue(new Error('LLM error'));

    const result = await evaluateSuggestionDimensions({
      before: 'stary tekst',
      after: 'nowy tekst',
      suggestionType: 'restructure',
      orgId: 'org-1',
    });

    expect(result).toEqual({});
  });

  it('wywołuje relewantne wymiary dla type=pronoun_context', async () => {
    await evaluateSuggestionDimensions({
      before: 'stary tekst',
      after: 'nowy tekst',
      suggestionType: 'pronoun_context',
      orgId: 'org-1',
    });

    // pronoun_context → selfContainedness = 1 call
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });
});
