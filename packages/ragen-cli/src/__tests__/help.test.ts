import { describe, expect, it } from 'vitest';

import { COMMANDS } from '../commands';
import { helpText, notBuiltYet } from '../help';

describe('helpText', () => {
  const text = helpText('1.2.3');

  it('names the version it was given', () => {
    expect(text).toContain('ragen 1.2.3');
  });

  it('lists every command, built or not', () => {
    // Derived from the same table the router uses, so this catches a command
    // added to one and forgotten in the other.
    for (const command of COMMANDS) {
      expect(text, `${command.name} missing from help`).toContain(command.name);
      expect(text).toContain(command.summary);
    }
  });

  it('separates what works from what does not', () => {
    expect(text).toContain('Not built yet');
    expect(text.indexOf('Commands')).toBeLessThan(
      text.indexOf('Not built yet'),
    );
  });
});

describe('notBuiltYet', () => {
  it('says what the command is waiting on', () => {
    const message = notBuiltYet({
      name: 'plugin',
      summary: 'manage custom MCP connectors',
      status: 'planned',
      blockedBy: 'custom MCP connectors (ADR-38 Tier 1)',
    });

    expect(message).toContain('`ragen plugin` is not built yet');
    expect(message).toContain('ADR-38 Tier 1');
  });
});
