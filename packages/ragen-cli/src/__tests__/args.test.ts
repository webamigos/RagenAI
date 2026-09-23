import { describe, expect, it } from 'vitest';

import { parseArgs } from '../args';

describe('parseArgs', () => {
  it('reads no command from an empty invocation', () => {
    expect(parseArgs([])).toEqual({
      command: undefined,
      rest: [],
      help: false,
      version: false,
    });
  });

  it('takes the first positional as the command', () => {
    expect(parseArgs(['create']).command).toBe('create');
  });

  it('passes everything after the command through untouched', () => {
    // The order and the flags both matter: create-ragen-app parses these, and
    // this CLI must not normalise them on the way.
    expect(
      parseArgs(['create', './app', '--skip-docker', '--ref=main']).rest,
    ).toEqual(['./app', '--skip-docker', '--ref=main']);
  });

  it("treats --help after a command as the command's, not ours", () => {
    const args = parseArgs(['create', '--help']);
    expect(args.help).toBe(false);
    expect(args.rest).toEqual(['--help']);
  });

  it('treats --help before a command as ours', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('recognises both spellings of the version flag', () => {
    expect(parseArgs(['--version']).version).toBe(true);
    expect(parseArgs(['-v']).version).toBe(true);
  });
});
