import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { applyKeystrokes, readFirstLine } from '../prompt';

const start = { value: '', done: false, cancelled: false };

describe('applyKeystrokes', () => {
  it('collects a pasted key in one chunk and finishes on Enter', () => {
    expect(applyKeystrokes(start, 'sk-abc.def\r')).toEqual({
      value: 'sk-abc.def',
      done: true,
      cancelled: false,
    });
  });

  it('handles backspace across chunks', () => {
    const typed = applyKeystrokes(applyKeystrokes(start, 'sk-ab'), '\u007fc');
    expect(typed.value).toBe('sk-ac');
    expect(typed.done).toBe(false);
  });

  it('cancels on Ctrl-C and keeps nothing', () => {
    expect(applyKeystrokes(start, 'sk-secret\u0003')).toEqual({
      value: '',
      done: true,
      cancelled: true,
    });
  });

  it('ignores other control characters', () => {
    expect(applyKeystrokes(start, 'a\u001bb').value).toBe('ab');
  });
});

describe('readFirstLine', () => {
  it('gives up on a stdin that stays open and silent, and closes it', async () => {
    const silent = new Readable({ read() {} });
    await expect(readFirstLine(silent, 20)).rejects.toThrow(
      /No API key arrived on stdin/,
    );
    expect(silent.destroyed).toBe(true);
  });

  it('reads the first line of piped input', async () => {
    await expect(
      readFirstLine(Readable.from(['sk-a.b\n', 'more\n']), 1000),
    ).resolves.toBe('sk-a.b');
  });

  it('reads input with no trailing newline', async () => {
    await expect(readFirstLine(Readable.from(['sk-a.b']), 1000)).resolves.toBe(
      'sk-a.b',
    );
  });
});
