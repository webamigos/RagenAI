import { toOpenAIAssistant } from './assistants.mapper.js';

describe('toOpenAIAssistant', () => {
  const baseProject = {
    id: 'abc-123',
    title: 'Support Bot',
    createdAt: new Date('2026-04-14T12:00:00Z'),
    settings: { instructions: 'Be concise.' },
  };

  it('maps fields + uses org defaults', () => {
    const out = toOpenAIAssistant(baseProject, {
      model: 'gpt-5.4',
      temperature: 0.3,
    });
    expect(out).toEqual({
      id: 'asst-abc-123',
      object: 'assistant',
      created_at: Math.floor(new Date('2026-04-14T12:00:00Z').getTime() / 1000),
      name: 'Support Bot',
      description: null,
      model: 'gpt-5.4',
      instructions: 'Be concise.',
      tools: [{ type: 'file_search' }],
      tool_resources: {},
      metadata: {},
      temperature: 0.3,
      top_p: 1.0,
      response_format: 'auto',
    });
  });

  it('falls back to defaults when org has no model/temperature', () => {
    const out = toOpenAIAssistant(baseProject);
    expect(out.model).toBe('ragen');
    expect(out.temperature).toBe(1.0);
  });

  it('returns null instructions when ProjectSettings row is missing', () => {
    const out = toOpenAIAssistant({ ...baseProject, settings: null });
    expect(out.instructions).toBeNull();
  });

  it('created_at is 0 when createdAt is null', () => {
    const out = toOpenAIAssistant({ ...baseProject, createdAt: null });
    expect(out.created_at).toBe(0);
  });
});
