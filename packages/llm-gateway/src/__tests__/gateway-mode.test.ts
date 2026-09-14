import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GATEWAY_MODE,
  InvalidGatewayModeError,
  gatewayModeFromEnv,
  usingNativeGateway,
} from '../gateway-mode';

describe('choosing a path', () => {
  it('defaults to the proxy when nothing says otherwise', () => {
    expect(gatewayModeFromEnv({})).toBe('litellm');
    expect(DEFAULT_GATEWAY_MODE).toBe('litellm');
  });

  it('treats an empty value as unset rather than invalid', () => {
    expect(gatewayModeFromEnv({ LLM_GATEWAY: '' })).toBe('litellm');
    expect(gatewayModeFromEnv({ LLM_GATEWAY: '   ' })).toBe('litellm');
  });

  it('reads both modes', () => {
    expect(gatewayModeFromEnv({ LLM_GATEWAY: 'native' })).toBe('native');
    expect(gatewayModeFromEnv({ LLM_GATEWAY: 'litellm' })).toBe('litellm');
  });

  it('ignores surrounding whitespace, which a compose file adds easily', () => {
    expect(gatewayModeFromEnv({ LLM_GATEWAY: ' native ' })).toBe('native');
  });

  /**
   * The behaviour the measurement depends on. A typo that fell back to the
   * default would run the proxy arm twice and report it as a comparison.
   */
  it('throws on an unrecognised value instead of falling back', () => {
    expect(() => gatewayModeFromEnv({ LLM_GATEWAY: 'nativ' })).toThrow(
      InvalidGatewayModeError,
    );
    expect(() => gatewayModeFromEnv({ LLM_GATEWAY: 'NATIVE' })).toThrow(
      InvalidGatewayModeError,
    );
  });

  it('names the offending value and the accepted ones', () => {
    expect(() => gatewayModeFromEnv({ LLM_GATEWAY: 'gateway' })).toThrow(
      /must be one of litellm, native — got "gateway"/,
    );
  });

  it('answers the question every call site actually asks', () => {
    expect(usingNativeGateway({ LLM_GATEWAY: 'native' })).toBe(true);
    expect(usingNativeGateway({ LLM_GATEWAY: 'litellm' })).toBe(false);
    expect(usingNativeGateway({})).toBe(false);
  });
});
