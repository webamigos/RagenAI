import { toOpenAIModel } from './models.mapper.js';

describe('toOpenAIModel', () => {
  const entry = {
    value: 'gemini-3-flash-preview',
    displayName: 'Gemini 3 Flash',
    visible: true,
    origin: 'google' as const,
  };

  it('maps a catalogue entry onto the OpenAI Model shape', () => {
    expect(toOpenAIModel(entry)).toEqual({
      id: 'gemini-3-flash-preview',
      object: 'model',
      created: 0,
      owned_by: 'google',
    });
  });

  // The vendor behind the model, not our own name repeated on every row — it
  // is the one field an OpenAI client prints next to the id.
  it('reports the vendor in owned_by, not ragen', () => {
    expect(toOpenAIModel(entry).owned_by).toBe('google');
    expect(toOpenAIModel({ ...entry, origin: 'anthropic' }).owned_by).toBe(
      'anthropic',
    );
  });

  // A constant epoch copied from OpenAI's own response is a plausible date
  // that is false. Zero is visibly not a date.
  it('does not invent a publication date', () => {
    expect(toOpenAIModel(entry).created).toBe(0);
  });

  // The display name is presentation metadata for our own picker; an OpenAI
  // Model carries no name field, and inventing one stops the surface being
  // OpenAI-compatible.
  it('drops catalogue fields OpenAI does not define', () => {
    expect(Object.keys(toOpenAIModel(entry)).sort()).toEqual([
      'created',
      'id',
      'object',
      'owned_by',
    ]);
  });
});
