import { describe, expect, it } from 'vitest';

import { parseFlags, positiveInt } from '../flags';

describe('parseFlags', () => {
  it('takes the connection flags everywhere, and only the named value flags', () => {
    const flags = parseFlags(
      ['--url', 'https://x', 'a.pdf', '--limit', '5', '--wait', 'b.pdf'],
      ['--limit'],
    );
    expect(flags.values.get('--url')).toBe('https://x');
    expect(flags.values.get('--limit')).toBe('5');
    expect(flags.switches.has('--wait')).toBe(true);
    expect(flags.positional).toEqual(['a.pdf', 'b.pdf']);
  });

  it('reads an unknown flag as a switch, not as swallowing the next argument', () => {
    const flags = parseFlags(['--verbose', 'a.pdf'], []);
    expect(flags.switches.has('--verbose')).toBe(true);
    expect(flags.positional).toEqual(['a.pdf']);
  });
});

describe('positiveInt', () => {
  it('is undefined when absent and a number when valid', () => {
    expect(positiveInt(parseFlags([], ['--max']), '--max')).toBeUndefined();
    expect(positiveInt(parseFlags(['--max', '3'], ['--max']), '--max')).toBe(3);
  });

  it.each(['0', '-1', '2.5', 'abc', ''])(
    'refuses %j instead of quietly using the default',
    (raw) => {
      expect(() =>
        positiveInt(parseFlags(['--max', raw], ['--max']), '--max'),
      ).toThrow(/positive whole number/);
    },
  );
});
