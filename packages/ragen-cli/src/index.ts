#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { runBrain } from './brain';
import { run } from './cli';
import {
  configPath,
  parseStoredConnection,
  withStoredConnection,
} from './config';
import { runCreate } from './create';
import { runDoctor } from './doctor';
import { runKb } from './kb';
import { runLogin, runLogout } from './login';
import { promptHidden, readFirstLine } from './prompt';
import { runSearch } from './search';
import { readVersion } from './version';

// `__dirname` is dist/ in the published package and src/ when run from the
// repository; package.json is one level up in both.
const version = readVersion(join(__dirname, '..', 'package.json'));

const out = (message: string) => console.log(message);
const err = (message: string) => console.error(message);

const savedAt = configPath(process.env, homedir(), process.platform);
const stored = parseStoredConnection(readIfPresent(savedAt));
// What `kb`, `search` and `brain` see: flags, then the environment, then
// what `ragen login` saved. `login` and `doctor` get the real environment,
// because they report or replace the saved connection rather than use it.
const env = withStoredConnection(process.env, stored);

async function removeConfig(path: string): Promise<boolean> {
  try {
    await rm(path);
    return true;
  } catch {
    return false;
  }
}

function readIfPresent(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

Promise.resolve()
  .then(() =>
    run(process.argv.slice(2), {
      version,
      create: (args) => runCreate(args),
      brain: (args) =>
        runBrain(args, {
          fetch,
          env,
          writeFile: (path, content) => writeFile(path, content, 'utf8'),
          mkdir: async (path) => {
            await mkdir(path, { recursive: true });
          },
          out,
          err,
        }),
      kb: (args) =>
        runKb(args, {
          fetch,
          env,
          readFile: (path) => readFile(path),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          now: () => Date.now(),
          out,
          err,
        }),
      search: (args) => runSearch(args, { fetch, env, out, err }),
      login: (args) =>
        runLogin(args, {
          fetch,
          env: process.env,
          configPath: savedAt,
          readKey: () => {
            if (process.stdin.isTTY) {
              return promptHidden('API key: ');
            }
            return readFirstLine(process.stdin);
          },
          saveConfig: async (path, content) => {
            await mkdir(dirname(path), { recursive: true, mode: 0o700 });
            await writeFile(path, content, { encoding: 'utf8', mode: 0o600 });
            // `mode` applies only when the file is created; a file left by an
            // earlier version, or created by hand, keeps its own until this.
            await chmod(path, 0o600);
          },
          removeConfig,
          out,
          err,
        }),
      logout: (args) =>
        runLogout(args, {
          configPath: savedAt,
          removeConfig,
          out,
        }),
      doctor: (args) =>
        runDoctor(args, {
          fetch,
          env: process.env,
          stored,
          configPath: savedAt,
          version,
          nodeVersion: process.version,
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
