#!/usr/bin/env tsx
/* eslint-disable no-console */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

async function startForE2E() {
  const isCI = process.env.CI === 'true';
  const nextBuildDir = join(process.cwd(), '.next');

  try {
    // In CI, always build first
    if (isCI || !existsSync(nextBuildDir)) {
      console.log('Building Next.js application...');
      execSync('npm run build', {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
    }

    console.log('Starting Next.js application...');
    execSync('npm run start', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

startForE2E();
