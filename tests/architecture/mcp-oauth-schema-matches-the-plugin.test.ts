import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mcp } from '@better-auth/mcp';
import { jwt } from 'better-auth/plugins';
import { describe, expect, it } from 'vitest';

const text = readFileSync(
  resolve(process.cwd(), 'prisma/schema.prisma'),
  'utf8',
);
const models = {
  ...mcp({
    resource: 'http://localhost:3300/mcp',
    loginPage: '/login',
    consentPage: '/consent',
  }).schema,
  ...jwt().schema,
};
const types: Record<string, string> = {
  string: 'String',
  'string[]': 'String[]',
  boolean: 'Boolean',
  number: 'Int',
  date: 'DateTime',
  json: 'Json',
};

describe('MCP authorization-server schema', () => {
  it.each(Object.entries(models))(
    '%s has every field declared by the installed plugin',
    (key, definition) => {
      const modelName = key[0].toUpperCase() + key.slice(1);
      const body = text.match(
        new RegExp(String.raw`model ${modelName} \{([\s\S]*?)\n\}`),
      )?.[1];
      expect(body, `Missing plugin model ${modelName}`).toBeDefined();
      for (const [field, config] of Object.entries(definition.fields)) {
        const actual = body!
          .split('\n')
          .map((line) => line.trim().split(/\s+/))
          .find(([name]) => name === field);
        const type = types[config.type as string];
        const optional = config.required === false && !type.endsWith('[]');
        expect(actual?.[1], `${modelName}.${field}`).toBe(
          type + (optional ? '?' : ''),
        );
      }
    },
  );
});
