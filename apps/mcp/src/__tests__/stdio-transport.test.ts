import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { NO_SESSION_ERROR } from '../tools/no-session.js';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** tsx compiles on start-up, and the OTel imports are not small. */
const BOOTS_A_PROCESS = 30_000;

interface JsonRpcMessage {
  jsonrpc: string;
  id?: number;
  result?: Record<string, unknown>;
  error?: unknown;
}

/**
 * The real entry point, started the way Glama's inspection starts it: as a
 * child process spoken to over stdin/stdout, with no key and no apps/api.
 *
 * Not the FastMCP object in-process, because the failure this guards is not
 * in FastMCP: it is a log line — ours, FastMCP's or the OTel bootstrap's —
 * landing on stdout, where the client reads it as a malformed message. Only
 * the whole process, with its real logger, can show that.
 */
describe('the server over stdio', () => {
  let child: ChildProcessWithoutNullStreams | undefined;

  afterEach(() => {
    child?.kill();
    child = undefined;
  });

  it(
    'answers initialize, lists its tools, and writes nothing else to stdout',
    { timeout: BOOTS_A_PROCESS },
    async () => {
      child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
        cwd: APP_DIR,
        env: {
          PATH: process.env.PATH,
          TARGET_ENV: 'local',
          RAGEN_MCP_TRANSPORT: 'stdio',
        },
      });

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const stdoutLines: string[] = [];
      const waiting = new Map<number, (message: JsonRpcMessage) => void>();
      createInterface({ input: child.stdout }).on('line', (line) => {
        stdoutLines.push(line);
        // A line that is not JSON is the defect under test. Skipped here, so
        // it fails the assertion at the end by name rather than as an
        // unhandled error from inside this listener.
        let message: JsonRpcMessage;
        try {
          message = JSON.parse(line) as JsonRpcMessage;
        } catch {
          return;
        }
        if (message.id !== undefined) {
          waiting.get(message.id)?.(message);
        }
      });

      const send = (message: object) =>
        child?.stdin.write(
          `${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`,
        );
      const request = (id: number, method: string, params: object = {}) =>
        new Promise<JsonRpcMessage>((resolve) => {
          waiting.set(id, resolve);
          send({ id, method, params });
        });

      const initialized = await request(1, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'stdio-transport.test', version: '0.0.0' },
      });
      send({ method: 'notifications/initialized' });
      const listed = await request(2, 'tools/list');
      const called = await request(3, 'tools/call', {
        name: 'ragen_list_assistants',
        arguments: {},
      });

      expect(initialized.result?.serverInfo).toMatchObject({ name: 'Ragen' });
      expect(
        (listed.result?.tools as { name: string }[]).map((tool) => tool.name),
      ).toEqual(
        expect.arrayContaining([
          'ragen_chat',
          'ragen_list_assistants',
          'ragen_search_knowledge_base',
        ]),
      );
      // No key: the session started anyway, and the tool says what to set
      // rather than reaching an apps/api that is not there.
      const [content] = called.result?.content as { text: string }[];
      expect(JSON.parse(content?.text ?? '')).toEqual({
        success: false,
        error: NO_SESSION_ERROR,
      });

      // The point of the test. Every line on stdout is a JSON-RPC message;
      // the logs went to stderr. The line looked for is the rejected stdio
      // authentication, logged while the session starts — so before the
      // first response — not the start-up line logged after it, which can
      // still be in pino's buffer when the last response arrives.
      const notJsonRpc = stdoutLines.filter((line) => {
        try {
          return (JSON.parse(line) as JsonRpcMessage).jsonrpc !== '2.0';
        } catch {
          return true;
        }
      });
      expect(notJsonRpc).toEqual([]);
      expect(stderr).toContain('RAGEN_API_KEY is not set');
    },
  );
});
