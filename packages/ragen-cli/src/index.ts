#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { runAsk } from './ask';
import { runAssistants } from './assistants';
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

/**
 * How long `login` waits for a piped key. A pipe that never sends one — an
 * ssh session without a tty, some CI runners — would otherwise hang.
 */
const STDIN_TIMEOUT_MS = 30_000;

const savedAt = configPath(process.env, homedir(), process.platform);
const stored = parseStoredConnection(readIfPresent(savedAt));
// What `kb`, `search` and `brain` see: flags, then the environment, then
// what `ragen login` saved. `login` and `doctor` get the real environment,
// because they report or replace the saved connection rather than use it.
const env = withStoredConnection(process.env, stored);

/**
 * `false` only when there was no file. Any other failure — a permission, a
 * read-only disk — is thrown: `logout` reporting "not logged in" while the key
 * is still on disk is the one wrong answer it must not give.
 */
async function removeConfig(path: string): Promise<boolean> {
  try {
    await rm(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Written to a file created 0600 and renamed over the old one, so the key is
 * never readable by others even for a moment — `writeFile`'s `mode` applies
 * only when it creates the file, and an existing 0644 file would have held
 * the new key until a `chmod` after it.
 */
async function saveConfig(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, path);
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
      ask: (args) =>
        runAsk(args, {
          fetch,
          env,
          write: (chunk) => {
            process.stdout.write(chunk);
          },
          isTTY: process.stdout.isTTY === true,
          out,
          err,
        }),
      assistants: (args) => runAssistants(args, { fetch, env, out, err }),
      login: (args) =>
        runLogin(args, {
          fetch,
          env: process.env,
          configPath: savedAt,
          readKey: () => {
            if (process.stdin.isTTY) {
              return promptHidden('API key: ');
            }
            return readFirstLine(process.stdin, STDIN_TIMEOUT_MS);
          },
          saveConfig,
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
