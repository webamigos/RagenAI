import fs from 'fs';
import os from 'os';
import path from 'path';

import { logger } from '../services/logger';

export const TMP_DIR = path.join(os.tmpdir(), 'ragen-worker');
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Removes files older than MAX_AGE_MS from the ragen-worker tmp directory.
 * Called on worker startup to clean up orphaned files from failed workflows
 * or container restarts.
 */
export function cleanStaleTmpFiles(): void {
  if (!fs.existsSync(TMP_DIR)) {
    return;
  }

  const now = Date.now();
  let removed = 0;

  for (const file of fs.readdirSync(TMP_DIR)) {
    try {
      const filePath = path.join(TMP_DIR, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile() && now - stat.mtimeMs > MAX_AGE_MS) {
        fs.unlinkSync(filePath);
        removed++;
      }
    } catch {
      // Ignore errors for individual files
    }
  }

  if (removed > 0) {
    logger.info({ removed, tmpDir: TMP_DIR }, 'Removed stale tmp files');
  }
}
