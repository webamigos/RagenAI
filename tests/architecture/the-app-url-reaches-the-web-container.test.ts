import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

/**
 * The container stack lets an install set the address its users open.
 *
 * `docker-compose.fullapp.yml` wrote web's `APP_URL` as a literal localhost
 * in `environment:`, which wins over `env_file:` — so `APP_URL` in
 * `.env.local` never reached the container, and any install opened from
 * another machine answered as localhost. The rename from `BETTER_AUTH_URL`
 * (#1656) carried the literal over unchanged. Found while writing
 * `infra/appliance/install-spark.sh`, which needs `--host` to work.
 */

const ROOT = process.cwd();

function webEnvironment(): string {
  const compose = readFileSync(
    join(ROOT, 'docker-compose.fullapp.yml'),
    'utf8',
  );
  const web = /^ {2}web:\n([\s\S]*?)^ {2}\w/m.exec(compose)?.[1] ?? '';
  return web;
}

describe("web's public address in the container stack", () => {
  it.each(['APP_URL', 'NEXT_PUBLIC_APP_URL'])(
    '%s is read from the environment, with localhost only as the default',
    (key) => {
      const line = new RegExp(`^\\s+${key}: (.*)$`, 'm').exec(webEnvironment());

      expect(line?.[1]).toMatch(/^\$\{APP_URL:-http:\/\/localhost:/);
    },
  );
});
