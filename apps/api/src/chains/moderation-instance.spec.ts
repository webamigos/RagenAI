const mockModerationsCreate = vi.fn();

// jest's CommonJS interop let the factory return the constructor itself; real
// ESM needs the module namespace, with the class under `default`. The arrow
// also has to become a `function`, because the source does `new OpenAI(...)`.
vi.mock('openai', () => ({
  default: vi.fn(function () {
    return {
      moderations: {
        create: (...args: unknown[]) => mockModerationsCreate(...args),
      },
    };
  }),
}));

import { createModerationInstance } from './moderation-instance.js';

describe('createModerationInstance', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.OPENAI_MODERATION_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('throws when no API key is available', () => {
    expect(() => createModerationInstance()).toThrow(
      'Cannot create moderation instance',
    );
  });

  it('uses the explicit orgApiKey when provided', () => {
    expect(() => createModerationInstance('org-key')).not.toThrow();
  });

  it('falls back to OPENAI_MODERATION_KEY', () => {
    process.env.OPENAI_MODERATION_KEY = 'moderation-key';
    expect(() => createModerationInstance()).not.toThrow();
  });

  it('falls back to OPENAI_API_KEY when OPENAI_MODERATION_KEY is unset', () => {
    process.env.OPENAI_API_KEY = 'api-key';
    expect(() => createModerationInstance()).not.toThrow();
  });

  it('invoke() maps the OpenAI moderation response to ModerationResult[]', async () => {
    mockModerationsCreate.mockResolvedValue({
      results: [{ flagged: true, categories: { hate: true, violence: false } }],
    });

    const instance = createModerationInstance('org-key');
    const result = await instance.invoke({ input: 'some text' });

    expect(mockModerationsCreate).toHaveBeenCalledWith({ input: 'some text' });
    expect(result.results).toEqual([
      { flagged: true, categories: { hate: true, violence: false } },
    ]);
  });
});
