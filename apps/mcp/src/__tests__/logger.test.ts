import { otelLogger } from '../telemetry/otel-logger.js';
import { logger } from '../logger.js';

jest.mock('../telemetry/otel-logger.js', () => ({
  otelLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockOtelLogger = otelLogger as jest.Mocked<typeof otelLogger>;

describe('logger', () => {
  it('mirrors an info line to the OTel logs bridge', () => {
    logger.info('Server started');

    expect(mockOtelLogger.info).toHaveBeenCalledWith(
      'Server started',
      undefined,
    );
  });

  it('splits pino (attrs, message) calls into an OTel message and attributes', () => {
    logger.error({ tool: 'ragen_chat', status: 500 }, 'Tool call failed');

    expect(mockOtelLogger.error).toHaveBeenCalledWith('Tool call failed', {
      tool: 'ragen_chat',
      status: 500,
    });
  });

  it('maps fatal onto OTel error, which has no separate fatal severity', () => {
    logger.fatal('Unrecoverable');

    expect(mockOtelLogger.error).toHaveBeenCalledWith(
      'Unrecoverable',
      undefined,
    );
  });

  it('does not ship debug lines to the collector', () => {
    // Deliberate: debug is a local aid, and mirroring it would be noise
    // nobody reads. It still reaches stdout via pino.
    logger.debug({ detail: 'x' }, 'Verbose detail');

    expect(mockOtelLogger.debug).not.toHaveBeenCalled();
  });

  it('emits nothing to OTel for an attributes-only call with no message', () => {
    logger.warn({ tool: 'ragen_chat' });

    expect(mockOtelLogger.warn).not.toHaveBeenCalled();
  });
});
