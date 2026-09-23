import { describe, expect, it } from 'vitest';

import { COMMANDS, findCommand } from '../commands';

describe('the command table', () => {
  it('has no duplicate names', () => {
    const names = COMMANDS.map((command) => command.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every planned command a reason it is not built', () => {
    // Without this a planned command prints "waiting on work that has not
    // started", which tells the reader nothing they can act on.
    for (const command of COMMANDS.filter((c) => c.status === 'planned')) {
      expect(
        command.blockedBy,
        `${command.name} has no blockedBy`,
      ).toBeTruthy();
    }
  });

  it('keeps summaries to one short lower-case line', () => {
    for (const command of COMMANDS) {
      expect(command.summary).not.toMatch(/\n/);
      expect(command.summary).not.toMatch(/\.$/);
      expect(command.summary.length).toBeLessThanOrEqual(60);
    }
  });

  it('finds a command by name and nothing by a name it does not have', () => {
    expect(findCommand('create')?.status).toBe('available');
    expect(findCommand('deploy')).toBeUndefined();
  });
});
