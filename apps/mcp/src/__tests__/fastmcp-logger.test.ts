import { logger } from '../logger.js';
import { fastmcpLogger } from '../fastmcp-logger.js';

jest.mock('../logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLogger = logger as unknown as {
  debug: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

describe('fastmcpLogger', () => {
  it('passes a single string message straight through', () => {
    fastmcpLogger.info('[FastMCP info] server is running');

    expect(mockLogger.info).toHaveBeenCalledWith(
      '[FastMCP info] server is running',
    );
  });

  it('maps FastMCP log onto info, which is the nearest severity it has', () => {
    fastmcpLogger.log('something happened');

    expect(mockLogger.info).toHaveBeenCalledWith('something happened');
  });

  it('renders a non-string argument rather than dropping it into [object Object]', () => {
    fastmcpLogger.error('session failed', { sessionId: 'abc' });

    const [message] = mockLogger.error.mock.calls[0] as [string];
    expect(message).toContain('session failed');
    expect(message).toContain('sessionId');
    expect(message).toContain('abc');
    expect(message).not.toContain('[object Object]');
  });

  it("keeps an Error's stack, which is the whole point of routing FastMCP's errors here", () => {
    fastmcpLogger.error(new Error('boom'));

    const [message] = mockLogger.error.mock.calls[0] as [string];
    expect(message).toContain('boom');
    expect(message).toContain('at ');
  });

  it('maps warn and debug to their own pino levels', () => {
    fastmcpLogger.warn('careful');
    fastmcpLogger.debug('noisy detail');

    expect(mockLogger.warn).toHaveBeenCalledWith('careful');
    expect(mockLogger.debug).toHaveBeenCalledWith('noisy detail');
  });
});
