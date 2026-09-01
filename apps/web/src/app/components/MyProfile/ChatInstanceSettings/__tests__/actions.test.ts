import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ASSISTANT_PROMPT_MAX_LENGTH } from '@/features/assistants/constants/limits';

vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: vi.fn().mockResolvedValue('org-123'),
}));

vi.mock('@/features/organizations/services/organization-settings', () => ({
  getOpenaiAPIKey: vi.fn().mockResolvedValue('sk-test'),
  getTemperatureSetting: vi.fn().mockResolvedValue(0.8),
  getModel: vi.fn().mockResolvedValue('gpt-4o'),
  getAssistantPrompt: vi.fn().mockResolvedValue(''),
  getMaxDocumentsToRetrieve: vi.fn().mockResolvedValue(5),
  saveOpenaiAPIKey: vi.fn().mockResolvedValue(undefined),
  saveTemperatureSetting: vi.fn().mockResolvedValue(undefined),
  saveModel: vi.fn().mockResolvedValue(undefined),
  saveAssistantPrompt: vi.fn().mockResolvedValue(undefined),
  saveMaxDocumentsToRetrieve: vi.fn().mockResolvedValue(undefined),
  getVoiceId: vi.fn().mockResolvedValue(null),
  saveVoiceId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/app/lib/utils/hashApiKey', () => ({
  maskApiKey: vi.fn((key: string) => key.slice(0, 4) + '****'),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import { saveSetting } from '../actions';
import { SettingsType } from '../types';

describe('saveSetting — prompt validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects prompt exceeding ASSISTANT_PROMPT_MAX_LENGTH', async () => {
    const overLimitPrompt = 'a'.repeat(ASSISTANT_PROMPT_MAX_LENGTH + 1);
    const result = await saveSetting(SettingsType.prompt, overLimitPrompt);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/exceeds maximum length/i);
  });

  it('accepts prompt at exactly the limit', async () => {
    const atLimitPrompt = 'a'.repeat(ASSISTANT_PROMPT_MAX_LENGTH);
    const result = await saveSetting(SettingsType.prompt, atLimitPrompt);

    expect(result.success).toBe(true);
  });

  it('accepts prompt under the limit', async () => {
    const shortPrompt = 'Be concise and professional.';
    const result = await saveSetting(SettingsType.prompt, shortPrompt);

    expect(result.success).toBe(true);
  });

  it('accepts empty prompt', async () => {
    const result = await saveSetting(SettingsType.prompt, '');

    expect(result.success).toBe(true);
  });
});
