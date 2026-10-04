import { isStdioTransport } from '../transport.js';

describe('isStdioTransport', () => {
  it('is true only for RAGEN_MCP_TRANSPORT=stdio', () => {
    expect(isStdioTransport({ RAGEN_MCP_TRANSPORT: 'stdio' })).toBe(true);
    expect(isStdioTransport({ RAGEN_MCP_TRANSPORT: 'http' })).toBe(false);
    expect(isStdioTransport({})).toBe(false);
  });
});
