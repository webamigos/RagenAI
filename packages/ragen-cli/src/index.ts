#!/usr/bin/env node
import { join } from 'node:path';

import { mkdir, writeFile } from 'node:fs/promises';

import { runBrain } from './brain';
import { run } from './cli';
import { runCreate } from './create';
import { readVersion } from './version';

// `__dirname` is dist/ in the published package and src/ when run from the
// repository; package.json is one level up in both.
const version = readVersion(join(__dirname, '..', 'package.json'));

const out = (message: string) => console.log(message);
const err = (message: string) => console.error(message);

Promise.resolve()
  .then(() =>
    run(process.argv.slice(2), {
      version,
      create: (args) => runCreate(args),
      brain: (args) =>
        runBrain(args, {
          fetch,
          env: process.env,
          writeFile: (path, content) => writeFile(path, content, 'utf8'),
          mkdir: async (path) => {
            await mkdir(path, { recursive: true });
          },
          out,
          err,
        }),
      out,
      err,
    }),
  )
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
