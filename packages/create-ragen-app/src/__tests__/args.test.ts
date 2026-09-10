import { describe, expect, it } from 'vitest';

import { parseArgs } from '../args';

describe('parseArgs', () => {
  it('leaves targetDir undefined when no positional argument is given', () => {
    expect(parseArgs([]).targetDir).toBeUndefined();
  });

  it('reads the positional argument as targetDir', () => {
    expect(parseArgs(['./my-ragen']).targetDir).toBe('./my-ragen');
  });

  it('defaults ref to main', () => {
    expect(parseArgs([]).ref).toBe('main');
  });

  it('reads --ref=<value>', () => {
    expect(parseArgs(['--ref=v1.2.0']).ref).toBe('v1.2.0');
  });

  it('defaults every flag to false', () => {
    const args = parseArgs([]);
    expect(args.skipDocker).toBe(false);
    expect(args.skipInstall).toBe(false);
    expect(args.yes).toBe(false);
  });

  it('reads --skip-docker, --skip-install and --yes', () => {
    const args = parseArgs([
      'my-app',
      '--skip-docker',
      '--skip-install',
      '--yes',
    ]);
    expect(args.targetDir).toBe('my-app');
    expect(args.skipDocker).toBe(true);
    expect(args.skipInstall).toBe(true);
    expect(args.yes).toBe(true);
  });
});
