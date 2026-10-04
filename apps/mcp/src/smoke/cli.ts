/**
 * `npm run smoke --workspace=@ragenai/mcp -- <url> [--query <text>] [--chat <message>]`
 *
 * Checks a running Ragen MCP server end to end — see ./smoke.ts for what
 * each step proves. The key comes from `RAGEN_API_KEY` and never from an
 * argument, so it stays out of shell history and process listings; set it
 * without echoing it:
 *
 *   read -s RAGEN_API_KEY && export RAGEN_API_KEY
 *
 * Exits 1 when a step fails, so it can gate a deployment.
 */
import { parseArgs } from 'node:util';

import { sdkClient } from './sdk-client.js';
import { formatResults, runSmoke } from './smoke.js';

/**
 * Sent when there is no key, so steps 1 and 2 can still run: the MCP server
 * checks only that the header is Bearer-shaped, and nothing it does before a
 * tool call reaches the API.
 */
const NO_KEY_PLACEHOLDER = 'sk-smoke.no-key';

const DEFAULT_QUERY = 'What is this knowledge base about?';

const USAGE =
  'Usage: npm run smoke --workspace=@ragenai/mcp -- <mcp-url> [--query <text>] [--chat <message>]\n' +
  'Example: npm run smoke --workspace=@ragenai/mcp -- https://ragen-mcp.example.com/mcp\n' +
  'The API key is read from RAGEN_API_KEY.';

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      query: { type: 'string' },
      chat: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help || positionals.length !== 1) {
    // eslint-disable-next-line no-console -- a CLI's output is the console
    console.error(USAGE);
    return values.help ? 0 : 2;
  }

  let url: URL;
  try {
    url = new URL(positionals[0] ?? '');
  } catch {
    // eslint-disable-next-line no-console -- as above
    console.error(`Not a URL: ${positionals[0]}\n\n${USAGE}`);
    return 2;
  }

  const apiKey = process.env.RAGEN_API_KEY?.trim();
  const results = await runSmoke(sdkClient(url, apiKey || NO_KEY_PLACEHOLDER), {
    hasKey: Boolean(apiKey),
    query: values.query ?? DEFAULT_QUERY,
    chatMessage: values.chat,
  });

  // eslint-disable-next-line no-console -- as above
  console.log(`Ragen MCP smoke test: ${url.href}\n${formatResults(results)}`);
  return results.some((r) => r.outcome === 'failed') ? 1 : 0;
}

process.exitCode = await main();
