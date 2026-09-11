import { randomBytes } from 'node:crypto';

/**
 * Matches every "Generate with: node -e ... randomBytes(32)" instruction
 * scattered across .env.example — one helper instead of five copy-pasted
 * one-liners.
 */
export function generateSecret(): string {
  return randomBytes(32).toString('hex');
}
