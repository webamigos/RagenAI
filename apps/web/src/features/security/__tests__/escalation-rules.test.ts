import { describe, it, expect } from 'vitest';
import { ESCALATION_RULES, getEscalationRule } from '../utils/escalation-rules';

describe('escalation rules', () => {
  it('returns a rule for known auth-burst event types', () => {
    const rule = getEscalationRule('AUTH_LOGIN_FAILED');
    expect(rule).not.toBeNull();
    expect(rule?.threshold).toBeGreaterThan(0);
    expect(rule?.windowMinutes).toBeGreaterThan(0);
  });

  it('returns a tighter window for CHAT_JAILBREAK_DETECTED than for AUTH_LOGIN_FAILED', () => {
    const auth = getEscalationRule('AUTH_LOGIN_FAILED');
    const jailbreak = getEscalationRule('CHAT_JAILBREAK_DETECTED');
    expect(auth).not.toBeNull();
    expect(jailbreak).not.toBeNull();
    // Jailbreak detection should react faster than password bruteforce
    expect(jailbreak!.windowMinutes).toBeLessThanOrEqual(auth!.windowMinutes);
  });

  it('returns null for event types that do not escalate', () => {
    // API_KEY_CREATED is an audit-style event — should never escalate
    expect(getEscalationRule('API_KEY_CREATED')).toBeNull();
    expect(getEscalationRule('API_KEY_REVOKED')).toBeNull();
    expect(getEscalationRule('AUTH_PASSWORD_RESET_REQUESTED')).toBeNull();
  });

  it('every rule has a positive threshold and window', () => {
    for (const [eventType, rule] of Object.entries(ESCALATION_RULES)) {
      if (rule) {
        expect(
          rule.threshold,
          `${eventType} threshold must be > 0`,
        ).toBeGreaterThan(0);
        expect(
          rule.windowMinutes,
          `${eventType} window must be > 0`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
