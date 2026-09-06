import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

import { parseEnv, parseEnvOrExit } from '../parse';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.string().optional(),
});

describe('parseEnv', () => {
  it('returns the parsed environment on success', () => {
    const result = parseEnv(schema, {
      DATABASE_URL: 'postgresql://localhost:5432/db',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.DATABASE_URL).toBe('postgresql://localhost:5432/db');
    }
  });

  it('reports every problem at once, not just the first', () => {
    // The whole point: a boot loop revealing one missing variable per
    // restart is how a ten-minute setup becomes an afternoon.
    const strict = z.object({
      A: z.string(),
      B: z.string(),
      C: z.string().url(),
    });

    const result = parseEnv(strict, { C: 'not-a-url' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.name).sort()).toEqual(['A', 'B', 'C']);
    }
  });

  it('names the variable in each issue so the report is actionable', () => {
    const result = parseEnv(schema, { DATABASE_URL: 'nonsense' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.name).toBe('DATABASE_URL');
      expect(result.report).toContain('DATABASE_URL');
      expect(result.report).toContain('1 problem');
    }
  });

  it('pluralises the report header, because it is read by humans under stress', () => {
    const strict = z.object({ A: z.string(), B: z.string() });
    const result = parseEnv(strict, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report).toContain('2 problems');
    }
  });

  it('does not throw on a bad environment — the caller decides what it means', () => {
    // apps/web must still boot on a broken environment: it serves the setup
    // page that explains how to fix it.
    expect(() => parseEnv(schema, {})).not.toThrow();
  });

  it('reads process.env when no source is given', () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://localhost:5432/from-process-env';

    try {
      const result = parseEnv(schema);
      expect(result.ok).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
    }
  });
});

describe('parseEnvOrExit', () => {
  it('returns the environment when it is valid', () => {
    const exit = vi.fn() as unknown as (code: number) => never;

    const env = parseEnvOrExit(
      schema,
      { DATABASE_URL: 'postgresql://localhost:5432/db' },
      exit,
    );

    expect(env.DATABASE_URL).toBe('postgresql://localhost:5432/db');
    expect(exit).not.toHaveBeenCalled();
  });

  it('prints the whole report and exits non-zero on a bad environment', () => {
    const exit = vi.fn() as unknown as (code: number) => never;
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      parseEnvOrExit(schema, {}, exit);
    } catch {
      // the injected exit does not actually stop execution
    }

    expect(exit).toHaveBeenCalledWith(1);
    // console, not a logger: this runs before instrumentation is up, and a
    // misconfiguration that exits silently just looks like a restart loop.
    expect(error).toHaveBeenCalledWith(expect.stringContaining('DATABASE_URL'));
    error.mockRestore();
  });
});
