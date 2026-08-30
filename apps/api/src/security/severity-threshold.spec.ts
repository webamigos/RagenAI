import { meetsAlertSeverityThreshold } from './severity-threshold.js';

describe('meetsAlertSeverityThreshold', () => {
  const originalEnv = process.env.SECURITY_ALERT_SEVERITY;

  beforeEach(() => {
    delete process.env.SECURITY_ALERT_SEVERITY;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SECURITY_ALERT_SEVERITY;
    } else {
      process.env.SECURITY_ALERT_SEVERITY = originalEnv;
    }
  });

  it('defaults to critical when env is unset', () => {
    expect(meetsAlertSeverityThreshold('critical')).toBe(true);
    expect(meetsAlertSeverityThreshold('warn')).toBe(false);
    expect(meetsAlertSeverityThreshold('info')).toBe(false);
  });

  it('defaults to critical when env is empty string', () => {
    process.env.SECURITY_ALERT_SEVERITY = '';
    expect(meetsAlertSeverityThreshold('warn')).toBe(false);
    expect(meetsAlertSeverityThreshold('critical')).toBe(true);
  });

  it('with threshold=warn, critical and warn pass but info does not', () => {
    process.env.SECURITY_ALERT_SEVERITY = 'warn';
    expect(meetsAlertSeverityThreshold('critical')).toBe(true);
    expect(meetsAlertSeverityThreshold('warn')).toBe(true);
    expect(meetsAlertSeverityThreshold('info')).toBe(false);
  });

  it('with threshold=info, every severity passes', () => {
    process.env.SECURITY_ALERT_SEVERITY = 'info';
    expect(meetsAlertSeverityThreshold('critical')).toBe(true);
    expect(meetsAlertSeverityThreshold('warn')).toBe(true);
    expect(meetsAlertSeverityThreshold('info')).toBe(true);
  });

  it('accepts values in any case', () => {
    process.env.SECURITY_ALERT_SEVERITY = 'WARN';
    expect(meetsAlertSeverityThreshold('warn')).toBe(true);
    process.env.SECURITY_ALERT_SEVERITY = '  Critical  ';
    expect(meetsAlertSeverityThreshold('warn')).toBe(false);
  });

  it('falls back to critical on unrecognized values (fail-safe)', () => {
    process.env.SECURITY_ALERT_SEVERITY = 'extreme';
    expect(meetsAlertSeverityThreshold('warn')).toBe(false);
    expect(meetsAlertSeverityThreshold('critical')).toBe(true);
  });
});
