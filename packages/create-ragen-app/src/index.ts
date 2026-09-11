#!/usr/bin/env node
import { run } from './cli';

run(process.argv.slice(2))
  .then((completed) => {
    if (!completed) {
      process.exitCode = 1;
    }
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
