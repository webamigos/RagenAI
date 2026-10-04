import { logger } from '../../logger.js';
import { NO_SESSION_ERROR, noSessionResult } from '../no-session.js';

vi.mock('../../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('noSessionResult', () => {
  it('answers with the fix for both transports instead of throwing', () => {
    expect(JSON.parse(noSessionResult('ragen_chat'))).toEqual({
      success: false,
      error: NO_SESSION_ERROR,
    });
    expect(NO_SESSION_ERROR).toContain('Authorization: Bearer');
    expect(NO_SESSION_ERROR).toContain('RAGEN_API_KEY');
  });

  it('logs which tool was refused', () => {
    noSessionResult('ragen_chat');

    expect(logger.warn).toHaveBeenCalledWith(
      { tool: 'ragen_chat' },
      expect.any(String),
    );
  });
});
