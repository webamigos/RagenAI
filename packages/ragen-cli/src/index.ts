#!/usr/bin/env node
import { join } from 'node:path';

import { run } from './cli';
import { runCreate } from './create';
import { readVersion } from './version';

// `__dirname` is dist/ in the published package and src/ when run from the
// repository; package.json is one level up in both.
const version = readVersion(join(__dirname, '..', 'package.json'));

try {
  process.exitCode = run(process.argv.slice(2), {
    version,
    create: (args) => runCreate(args),
    out: (message) => console.log(message),
    err: (message) => console.error(message),
  });
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
