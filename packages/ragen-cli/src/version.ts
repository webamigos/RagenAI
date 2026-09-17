import { readFileSync } from 'node:fs';

/**
 * Read from package.json rather than duplicated in the source, because a
 * hardcoded constant goes stale at the next `npm version` and nothing fails
 * when it does — the CLI would simply report the wrong version forever.
 */
export function readVersion(packageJsonPath: string): string {
  try {
    const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'version' in parsed &&
      typeof parsed.version === 'string'
    ) {
      return parsed.version;
    }
  } catch {
    // Falls through: a CLI that cannot print its own version should still run.
  }
  return 'unknown';
}
