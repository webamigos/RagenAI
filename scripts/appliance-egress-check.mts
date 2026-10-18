/**
 * Does the appliance send anything off the machine?
 *
 *   npm run appliance:egress-check                  # small models, then clean up
 *   npm run appliance:egress-check -- --full-models # the real route table
 *   npm run appliance:egress-check -- --keep        # leave the stack running
 *
 * Step A3 of docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md. It
 * brings the appliance up on a network with no route out
 * (docker-compose.appliance.sealed.yml), runs an ingest and a chat turn, and
 * fails if any container tried to leave — naming the container and the host
 * it asked for.
 *
 * **What it reads is the network's own refusal.** tcpdump on the sealed
 * network's bridge sees every packet a container sends; one addressed to
 * anything but another container on that network is an attempt to leave,
 * whatever the code that sent it thinks it is doing. A list of allowed
 * domains was rejected in the spec, because a list goes out of date while it
 * stays green. A name lookup shows up the same way: Docker's resolver
 * forwards a name it does not own, from the container, onto the bridge.
 *
 * **It checks that it can see before it believes a clean result.** A canary
 * container makes one lookup and one connection that must fail, and the run
 * stops if the capture missed either: a check that cannot see an attempt
 * reports none, and that would read as a pass.
 *
 * The stack runs in its own Compose project, from a temporary directory with
 * a generated environment, so nothing in this checkout's `.env.local` — cloud
 * keys included — reaches it, and nothing it publishes takes a port another
 * stack on the machine is using.
 *
 * What it does not cover yet: Brain, the guardrail first pass and the hybrid
 * profile. Those are the rest of A3.
 */
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { parse, stringify } from 'yaml';

import { MANIFEST } from '../packages/create-ragen-app/src/manifest.ts';

const execFileAsync = promisify(execFile);

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS_IMAGE = 'ragen-egress-check-tools:local';
const CHECK_EMAIL = 'egress-check@appliance.local';

// --- Options -----------------------------------------------------------------

export type Options = {
  readonly project: string;
  readonly keep: boolean;
  readonly fullModels: boolean;
  readonly chatModel: string;
  readonly embedModel: string;
  /** The embedding model's dimension, which Qdrant's collection must match. */
  readonly vectorSize: number;
  readonly version: string;
};

export const DEFAULT_OPTIONS: Options = {
  project: 'ragen-egress-check',
  keep: false,
  fullModels: false,
  // Small enough for a CI runner's CPU; the check is about traffic, not
  // answer quality, and a model that answers at all exercises the same path.
  chatModel: 'qwen2.5:0.5b',
  embedModel: 'all-minilm',
  vectorSize: 384,
  version: 'latest',
};

export function parseArgs(argv: readonly string[]): Options {
  const options: { -readonly [K in keyof Options]: Options[K] } = {
    ...DEFAULT_OPTIONS,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`${arg} needs a value`);
      }
      return next;
    };
    switch (arg) {
      case '--keep':
        options.keep = true;
        break;
      case '--full-models':
        options.fullModels = true;
        break;
      case '--project':
        options.project = value();
        break;
      case '--chat-model':
        options.chatModel = value();
        break;
      case '--embed-model':
        options.embedModel = value();
        break;
      case '--vector-size':
        options.vectorSize = Number.parseInt(value(), 10);
        if (!Number.isInteger(options.vectorSize) || options.vectorSize <= 0) {
          throw new Error('--vector-size must be a positive integer');
        }
        break;
      case '--version':
        options.version = value();
        break;
      case '--profile': {
        // Only `local` exists until the hybrid profile does; asking for
        // `hybrid` must not silently run the local check and pass.
        const profile = value();
        if (profile !== 'local') {
          throw new Error(
            `--profile ${profile} is not supported yet; only local is`,
          );
        }
        break;
      }
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

// --- The environment the stack gets ------------------------------------------

/**
 * `infra/appliance/appliance.env.example` with the secrets filled and the
 * overrides applied. Keys the example does not have are appended, so an
 * override is never silently dropped.
 */
export function applianceEnv(
  example: string,
  values: Readonly<Record<string, string>>,
): string {
  const remaining = new Map(Object.entries(values));
  const lines = example.split('\n').map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match || !remaining.has(match[1])) {
      return line;
    }
    const key = match[1];
    const replaced = `${key}=${remaining.get(key)}`;
    remaining.delete(key);
    return replaced;
  });
  for (const [key, value] of remaining) {
    lines.push(`${key}=${value}`);
  }
  return lines.join('\n');
}

/**
 * A fresh value for every secret create-ragen-app generates for the root
 * environment — the same list a real install gets, so the check cannot pass
 * on a stack that a fresh install would not boot.
 */
export function generatedSecrets(): Record<string, string> {
  return Object.fromEntries(
    MANIFEST.filter(
      (entry) =>
        entry.strategy === 'generate-secret' && entry.targets.includes('root'),
    ).map((entry) => [entry.key, randomBytes(32).toString('hex')]),
  );
}

/** The value a KEY=VALUE env file gives a key, or undefined. */
export function envValue(envFile: string, key: string): string | undefined {
  for (const line of envFile.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match?.[1] === key) {
      return match[2];
    }
  }
  return undefined;
}

// --- The route table it runs ---------------------------------------------------

type RouteFile = { routes?: Record<string, { model?: string }> };

/**
 * The appliance route table with every model swapped for a small one: the
 * embedding route's model (whichever route `EMBEDDINGS_MODEL` names) for
 * `embedModel`, every other model for `chatModel`.
 *
 * Derived from the real table rather than kept beside it, so a route added
 * to the appliance is in the check the same day — a second table would be
 * exactly the list that goes out of date.
 */
export function smallModelRouteTable(
  routeYaml: string,
  embeddingsRoute: string,
  models: { chatModel: string; embedModel: string },
): string {
  const table = parse(routeYaml) as RouteFile;
  const routes = table.routes ?? {};
  const embeddingModel = routes[embeddingsRoute]?.model;
  if (!embeddingModel) {
    throw new Error(
      `EMBEDDINGS_MODEL=${embeddingsRoute} is not a route in the appliance table`,
    );
  }
  for (const route of Object.values(routes)) {
    if (route.model) {
      route.model =
        route.model === embeddingModel ? models.embedModel : models.chatModel;
    }
  }
  return stringify(table);
}

/** Every model a route table names, once — what `ollama-models` must pull. */
export function modelsToPull(routeYaml: string): string[] {
  const routes = (parse(routeYaml) as RouteFile).routes ?? {};
  return [
    ...new Set(
      Object.values(routes)
        .map((route) => route.model)
        .filter((model): model is string => Boolean(model)),
    ),
  ];
}

// --- Reading the capture -------------------------------------------------------

export type Network = {
  /** CIDRs of the sealed network. */
  readonly subnets: readonly string[];
  /** The bridge's own address: a packet to it is a packet to the host. */
  readonly gateways: readonly string[];
};

export type Attempt = {
  readonly container: string;
  readonly kind: 'dns' | 'tcp' | 'udp' | 'icmp' | 'other';
  /** A host name for a lookup, `address:port` for a connection. */
  readonly destination: string;
  readonly count: number;
};

function ipv4ToInt(ip: string): number | undefined {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return undefined;
  }
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!/^\d{1,3}$/.test(part) || octet > 255) {
      return undefined;
    }
    value = value * 256 + octet;
  }
  return value;
}

export function inSubnet(ip: string, cidr: string): boolean {
  const [base, bitsText] = cidr.split('/');
  const address = ipv4ToInt(ip);
  const network = ipv4ToInt(base);
  const bits = Number(bitsText);
  if (address === undefined || network === undefined || !(bits >= 0)) {
    return false;
  }
  const size = 2 ** (32 - bits);
  return Math.floor(address / size) === Math.floor(network / size);
}

/** Multicast and broadcast never leave a link, so they are not attempts. */
function isLinkLocalOnly(ip: string): boolean {
  if (ip.includes(':')) {
    return ip.startsWith('ff') || ip.startsWith('fe80:');
  }
  const value = ipv4ToInt(ip);
  if (value === undefined) {
    return false;
  }
  const firstOctet = Math.floor(value / 2 ** 24);
  return (firstOctet >= 224 && firstOctet <= 239) || ip === '255.255.255.255';
}

/**
 * Split tcpdump's `address.port` into its parts. IPv4 with a port has five
 * dot-separated fields; IPv6 writes the port after the last dot as well.
 */
export function splitEndpoint(endpoint: string): {
  address: string;
  port?: string;
} {
  const trimmed = endpoint.replace(/:$/, '');
  if (trimmed.includes(':')) {
    const dot = trimmed.lastIndexOf('.');
    return dot === -1
      ? { address: trimmed }
      : { address: trimmed.slice(0, dot), port: trimmed.slice(dot + 1) };
  }
  const parts = trimmed.split('.');
  return parts.length === 5
    ? { address: parts.slice(0, 4).join('.'), port: parts[4] }
    : { address: trimmed };
}

// `epoch [iface direction] IP|IP6 src > dst: payload` (tcpdump `-tt`) — the
// interface and direction appear only when capturing on `any`.
const PACKET =
  /^(\d+(?:\.\d+)?) (?:\S+\s+(?:In|Out|M|B|P)\s+)?(IP6?) (\S+) > (\S+): (.*)$/;

/** Who held an address, and when the check saw them holding it. */
export type Holder = {
  readonly ip: string;
  readonly name: string;
  /** Epoch milliseconds of the first and last sighting. */
  readonly first: number;
  readonly last: number;
};

/**
 * Record what one look at the network showed. Docker hands a freed address to
 * the next container that starts, so an address can have several holders
 * over a run; each sighting extends the holder it belongs to.
 */
export function recordHolders(
  holders: Holder[],
  seen: ReadonlyMap<string, string>,
  at: number,
): void {
  for (const [ip, name] of seen) {
    const index = holders.findIndex(
      (holder) => holder.ip === ip && holder.name === name,
    );
    if (index === -1) {
      holders.push({ ip, name, first: at, last: at });
    } else {
      holders[index] = { ...holders[index], last: at };
    }
  }
}

// Sightings are sampled every half second, so a packet can fall just outside
// the window its container was seen in.
const SIGHTING_SLACK_MS = 2000;

/**
 * The container that held `ip` at `at`: the holder whose sightings cover that
 * moment, else the one seen nearest to it. Undefined only for an address no
 * sample ever caught.
 */
export function holderAt(
  holders: readonly Holder[],
  ip: string,
  at: number,
): string | undefined {
  const candidates = holders.filter((holder) => holder.ip === ip);
  const covering = candidates.find(
    (holder) =>
      holder.first - SIGHTING_SLACK_MS <= at &&
      at <= holder.last + SIGHTING_SLACK_MS,
  );
  if (covering) {
    return covering.name;
  }
  const distance = (holder: Holder) =>
    at < holder.first ? holder.first - at : at - holder.last;
  return [...candidates].sort((a, b) => distance(a) - distance(b))[0]?.name;
}
const LOOKUP =
  /\b(?:A|AAAA|CNAME|MX|TXT|SRV|PTR|HTTPS|SVCB|NS|SOA|ANY)\? (\S+?)\.? \(/;

/**
 * The attempts to leave in tcpdump's output for the sealed bridge: a packet
 * from a container on the network to anything that is not on it, or to the
 * bridge itself.
 *
 * `holders` says which container held which address when; an address no
 * sample caught is still reported, as `unknown (address)`, because an attempt
 * from a container that has already exited is no less an attempt.
 */
export function attemptsIn(
  lines: readonly string[],
  network: Network,
  holders: readonly Holder[],
): Attempt[] {
  const onNetwork = (ip: string) =>
    network.subnets.some((subnet) => inSubnet(ip, subnet));
  const found = new Map<string, Attempt>();
  for (const line of lines) {
    const packet = PACKET.exec(line.trim());
    if (!packet) {
      continue;
    }
    const [, epoch, , rawSource, rawDestination, payload] = packet;
    const source = splitEndpoint(rawSource);
    const destination = splitEndpoint(rawDestination);
    if (!onNetwork(source.address) || isLinkLocalOnly(destination.address)) {
      continue;
    }
    const leaves =
      !onNetwork(destination.address) ||
      network.gateways.includes(destination.address);
    if (!leaves) {
      continue;
    }

    const lookup = destination.port === '53' ? LOOKUP.exec(payload) : null;
    const kind: Attempt['kind'] = lookup
      ? 'dns'
      : payload.startsWith('Flags [')
        ? 'tcp'
        : payload.startsWith('ICMP')
          ? 'icmp'
          : /\bUDP\b/.test(payload) || destination.port === '53'
            ? 'udp'
            : 'other';
    const target = lookup
      ? lookup[1]
      : destination.port
        ? `${destination.address}:${destination.port}`
        : destination.address;
    const container =
      holderAt(holders, source.address, Number(epoch) * 1000) ??
      `unknown (${source.address})`;

    const key = `${container}\u0000${kind}\u0000${target}`;
    const previous = found.get(key);
    found.set(key, {
      container,
      kind,
      destination: target,
      count: (previous?.count ?? 0) + 1,
    });
  }
  return [...found.values()].sort(
    (a, b) =>
      a.container.localeCompare(b.container) ||
      a.destination.localeCompare(b.destination),
  );
}

export function formatAttempts(attempts: readonly Attempt[]): string {
  return attempts
    .map(
      (attempt) =>
        `  ${attempt.container}: ${attempt.kind} ${attempt.destination}` +
        (attempt.count > 1 ? ` (${attempt.count}×)` : ''),
    )
    .join('\n');
}

/**
 * Whether the capture saw the canary's lookup and connection. If it missed
 * either, a clean result means nothing.
 */
export function canarySeen(
  attempts: readonly Attempt[],
  canary: string,
): { lookup: boolean; connection: boolean } {
  const own = attempts.filter((attempt) => attempt.container === canary);
  return {
    lookup: own.some(
      (attempt) =>
        attempt.kind === 'dns' && attempt.destination === CANARY_HOST,
    ),
    connection: own.some(
      (attempt) => attempt.destination === `${CANARY_ADDRESS}:80`,
    ),
  };
}

// A name under a reserved TLD and an address from TEST-NET-1 (RFC 5737):
// neither can answer, so the canary's attempts are refused wherever it runs.
export const CANARY_HOST = 'egress-canary.invalid';
export const CANARY_ADDRESS = '192.0.2.1';

// --- Which Compose --------------------------------------------------------------

/** The oldest Compose that reads `env_file: - path:`, which fullapp uses. */
export const MINIMUM_COMPOSE = [2, 24, 0] as const;

/** `2.19.1`, `v2.29.7-desktop.1` or `5.1.2` as numbers, or undefined. */
export function composeVersion(output: string): number[] | undefined {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(output);
  return match ? match.slice(1, 4).map(Number) : undefined;
}

export function composeIsRecentEnough(version: readonly number[]): boolean {
  for (let i = 0; i < MINIMUM_COMPOSE.length; i++) {
    if (version[i] !== MINIMUM_COMPOSE[i]) {
      return version[i] > MINIMUM_COMPOSE[i];
    }
  }
  return true;
}

/**
 * The Compose to run: the `docker compose` plugin if it is recent enough,
 * else a standalone `docker-compose` that is. An older one rejects
 * docker-compose.fullapp.yml outright, so it is refused here with the reason
 * rather than at the first `up`.
 */
async function findCompose(): Promise<string[]> {
  const candidates = [['docker', 'compose'], ['docker-compose']];
  const seen: string[] = [];
  for (const candidate of candidates) {
    const [command, ...prefix] = candidate;
    const output = await execFileAsync(command, [
      ...prefix,
      'version',
      '--short',
    ]).then(
      ({ stdout }) => stdout,
      () => '',
    );
    const version = composeVersion(output);
    if (version && composeIsRecentEnough(version)) {
      return candidate;
    }
    if (version) {
      seen.push(`${candidate.join(' ')} ${version.join('.')}`);
    }
  }
  throw new Error(
    `Needs Docker Compose ${MINIMUM_COMPOSE.join('.')} or later; found ${
      seen.join(', ') || 'none'
    }.`,
  );
}

// --- Running it ----------------------------------------------------------------

type Run = { stdout: string; stderr: string };

async function run(
  command: string,
  args: readonly string[],
  options: { env?: NodeJS.ProcessEnv; input?: string; quiet?: boolean } = {},
): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (!options.quiet) {
        process.stdout.write(chunk);
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (!options.quiet) {
        process.stderr.write(chunk);
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${command} ${args.join(' ')} exited ${code}\n${stderr.trim()}`,
          ),
        );
      }
    });
    child.stdin.end(options.input ?? '');
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(
  what: string,
  timeoutMs: number,
  attempt: () => Promise<T | undefined>,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await attempt().catch(() => undefined);
    if (result !== undefined) {
      return result;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await sleep(3000);
  }
}

class Stack {
  readonly network: string;

  constructor(
    private readonly options: Options,
    private readonly workdir: string,
    private readonly env: NodeJS.ProcessEnv,
    /** `['docker', 'compose']` or `['docker-compose']`; see `findCompose`. */
    private readonly composeCommand: readonly string[],
  ) {
    this.network = `${options.project}_ragen-network`;
  }

  compose(args: readonly string[], sealed: boolean, quiet = false) {
    const files = [
      'docker-compose.yml',
      'docker-compose.fullapp.yml',
      'docker-compose.appliance.yml',
      ...(sealed ? ['docker-compose.appliance.sealed.yml'] : []),
    ].flatMap((file) => ['-f', path.join(REPO, file)]);
    const [command, ...prefix] = this.composeCommand;
    return run(
      command,
      [
        ...prefix,
        '-p',
        this.options.project,
        '--project-directory',
        this.workdir,
        ...files,
        ...args,
      ],
      { env: this.env, quiet },
    );
  }

  /** A command in a tools container on the sealed network. */
  tool(args: readonly string[], input?: string) {
    return run(
      'docker',
      ['run', '--rm', '-i', '--network', this.network, TOOLS_IMAGE, ...args],
      { input, quiet: true },
    );
  }

  async sql(query: string): Promise<string> {
    const { stdout } = await this.compose(
      [
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        'postgres',
        '-d',
        'ragen',
        '-At',
        '-c',
        query,
      ],
      true,
      true,
    );
    return stdout.trim();
  }
}

async function inspectNetwork(name: string): Promise<{
  id: string;
  network: Network;
  owners: Map<string, string>;
}> {
  const { stdout } = await execFileAsync('docker', [
    'network',
    'inspect',
    name,
  ]);
  const [info] = JSON.parse(stdout) as [
    {
      Id: string;
      IPAM: { Config: { Subnet?: string; Gateway?: string }[] | null };
      Containers: Record<string, { Name: string; IPv4Address: string }> | null;
    },
  ];
  const config = info.IPAM.Config ?? [];
  const owners = new Map<string, string>();
  for (const container of Object.values(info.Containers ?? {})) {
    owners.set(container.IPv4Address.split('/')[0], container.Name);
  }
  return {
    id: info.Id,
    network: {
      subnets: config.flatMap((entry) => (entry.Subnet ? [entry.Subnet] : [])),
      gateways: config.flatMap((entry) =>
        entry.Gateway ? [entry.Gateway] : [],
      ),
    },
    owners,
  };
}

/** The scripted pass: an account, one document ingested, one answer. */
async function scriptedPass(stack: Stack, secret: string): Promise<void> {
  const web = 'http://web:3000';
  console.log('\n— waiting for web');
  await waitFor('web to answer', 10 * 60_000, async () => {
    await stack.tool(['curl', '-sf', `${web}/api/healthcheck`]);
    return true;
  });

  console.log('— signing up the check account');
  // Better Auth's own endpoint, so the account, its organization and its
  // default project are created the way any sign-up creates them.
  await stack.tool([
    'curl',
    '-sf',
    '-X',
    'POST',
    `${web}/api/auth/sign-up/email`,
    '-H',
    'content-type: application/json',
    '-H',
    'origin: http://localhost:3000',
    '--data',
    JSON.stringify({
      email: CHECK_EMAIL,
      password: randomBytes(18).toString('base64url'),
      name: 'Egress check',
    }),
  ]);
  const ids = await waitFor('the check account', 60_000, async () => {
    const row = await stack.sql(
      `select u.id, m.organization_id, p.id from users u
         join members m on m.user_id = u.id
         join projects p on p.organization_id = m.organization_id
        where u.email = '${CHECK_EMAIL}'
        order by p.created_at limit 1`,
    );
    return row ? row.split('|') : undefined;
  });
  const [userId, orgId, projectId] = ids;
  const internal = [
    '-H',
    `x-internal-secret: ${secret}`,
    '-H',
    `x-org-id: ${orgId}`,
    '-H',
    `x-user-id: ${userId}`,
    '-H',
    `x-project-id: ${projectId}`,
  ];

  console.log('— ingesting one document');
  const uploaded = await stack.tool(
    [
      'curl',
      '-sf',
      '-X',
      'POST',
      `${web}/api/v1/files`,
      ...internal,
      '-F',
      'file=@-;filename=egress-check.md;type=text/markdown',
    ],
    [
      '# Egress check',
      '',
      'The appliance egress check uses the code word PELICAN-7.',
      'Every document on this machine stays on this machine.',
      '',
    ].join('\n'),
  );
  const fileId = (JSON.parse(uploaded.stdout) as { file: { id: string } }).file
    .id;
  const status = await waitFor(
    'the document to be embedded',
    15 * 60_000,
    async () => {
      const row = await stack.sql(
        `select embedding_status from user_files where id = '${fileId}'`,
      );
      return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(row)
        ? row
        : undefined;
    },
  );
  if (status !== 'COMPLETED') {
    throw new Error(`Ingest ended ${status}; the pass did not run`);
  }

  console.log('— asking one question');
  const answer = await stack.tool([
    'curl',
    '-sf',
    '--max-time',
    '900',
    '-X',
    'POST',
    `${web}/api/v1/chat`,
    ...internal,
    '-H',
    'content-type: application/json',
    '--data',
    JSON.stringify({
      prompt: 'What code word does the appliance egress check use?',
      stream: false,
      assistant_id: projectId,
    }),
  ]);
  const text = (JSON.parse(answer.stdout) as { text?: string }).text ?? '';
  if (!text.trim()) {
    throw new Error('The chat turn returned no text; the pass did not run');
  }
  console.log(`  answer: ${text.trim().slice(0, 200)}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const composeCommand = await findCompose();
  const workdir = mkdtempSync(path.join(tmpdir(), 'ragen-egress-check-'));
  const secret = randomBytes(32).toString('hex');

  // The stack's own directory: a copy of the route tables (the compose files
  // mount `./infra/llm-gateway`) and an environment written from the
  // appliance example, so this checkout's `.env.local` never reaches it.
  cpSync(
    path.join(REPO, 'infra/llm-gateway'),
    path.join(workdir, 'infra/llm-gateway'),
    { recursive: true },
  );
  const example = readFileSync(
    path.join(REPO, 'infra/appliance/appliance.env.example'),
    'utf8',
  );
  const envFile = applianceEnv(example, {
    ...generatedSecrets(),
    INTERNAL_API_SECRET: secret,
    ENCRYPTION_MASTER_KEY: randomBytes(32).toString('hex'),
    // Not in this pass: Presidio is a profile of its own (`--profile pii`).
    FEATURE_FLAG_PII_MASKING: '0',
    PRESIDIO_ANALYZER_URL: '',
    PRESIDIO_ANONYMIZER_URL: '',
    ...(options.fullModels ? {} : { VECTOR_SIZE: String(options.vectorSize) }),
  });
  writeFileSync(path.join(workdir, '.env.local'), envFile);

  const tablePath = path.join(
    workdir,
    'infra/llm-gateway/routes.appliance.yaml',
  );
  if (!options.fullModels) {
    writeFileSync(
      tablePath,
      smallModelRouteTable(
        readFileSync(tablePath, 'utf8'),
        envValue(envFile, 'EMBEDDINGS_MODEL') ?? 'local-embed',
        options,
      ),
    );
  }
  const models = modelsToPull(readFileSync(tablePath, 'utf8'));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RAGEN_VERSION: options.version,
    APPLIANCE_MODELS: models.join(' '),
    // Port 0 is "any free port": a sealed network is reached from inside, and
    // a fixed port would collide with any other stack on the machine.
    ...Object.fromEntries(
      [
        'POSTGRES_PORT',
        'QDRANT_PORT',
        'QDRANT_GRPC_PORT',
        'DOCLING_PORT',
        'REDIS_PORT',
        'OLLAMA_PORT',
        'WEB_PORT',
        'API_PORT',
        'ADMIN_PORT',
      ].map((name) => [name, '0']),
    ),
  };
  const stack = new Stack(options, workdir, env, composeCommand);
  const watcher = `${options.project}-watch`;
  const canary = `${options.project}-canary`;
  let failed = false;
  let passError: unknown;

  try {
    console.log(`— building the check's tools image`);
    await run('docker', [
      'build',
      '-q',
      '-t',
      TOOLS_IMAGE,
      path.join(REPO, 'infra/appliance/egress-check'),
    ]);

    // Before sealing: the one step that needs the internet. The job skips
    // models already on the volume, so a second run pulls nothing.
    console.log(`— pulling models (${models.join(', ')})`);
    await stack.compose(['up', '-d', 'ollama'], false);
    await stack.compose(['run', '--rm', 'ollama-models'], false);
    await stack.compose(['down'], false);

    // Created, not started: the network exists, so its bridge can be watched
    // before the first container sends anything.
    console.log('— sealing the network');
    await stack.compose(['up', '--no-start'], true);
    const { id } = await inspectNetwork(stack.network);
    await run(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        watcher,
        '--network',
        'host',
        '--cap-add',
        'NET_RAW',
        '--cap-add',
        'NET_ADMIN',
        TOOLS_IMAGE,
        'tcpdump',
        '-i',
        `br-${id.slice(0, 12)}`,
        '-nn',
        '-l',
        '-tt',
        'not arp',
      ],
      { quiet: true },
    );
    await waitFor('the capture to start', 30_000, async () => {
      const { stderr } = await run('docker', ['logs', watcher], {
        quiet: true,
      });
      return stderr.includes('listening on') ? true : undefined;
    });

    // Which container holds which address, sampled while the stack runs: a
    // one-shot job has left the network by the time the run ends.
    const holders: Holder[] = [];
    const sample = async () => {
      const current = await inspectNetwork(stack.network).catch(() => null);
      if (current) {
        recordHolders(holders, current.owners, Date.now());
      }
    };
    const sampler = setInterval(() => void sample(), 500);

    try {
      await run(
        'docker',
        [
          'run',
          '-d',
          '--name',
          canary,
          '--network',
          stack.network,
          TOOLS_IMAGE,
          'sh',
          '-c',
          `sleep 2; nslookup ${CANARY_HOST} >/dev/null 2>&1; curl -s -m 3 http://${CANARY_ADDRESS}/ >/dev/null; sleep 2`,
        ],
        { quiet: true },
      );
      await sample();

      console.log('— starting the sealed appliance');
      await stack.compose(['up', '-d'], true);
      // A failed pass still has a capture worth reading — an attempt to
      // leave is as likely to be why it failed as anything else.
      passError = await scriptedPass(stack, secret).then(
        () => undefined,
        (error: unknown) => error,
      );
      // Whatever an ingest or an answer starts in the background — a
      // summary, an index refresh — gets a moment to show itself.
      await sleep(15_000);
      await sample();
    } finally {
      clearInterval(sampler);
    }

    const { stdout } = await run('docker', ['logs', watcher], { quiet: true });
    const { network } = await inspectNetwork(stack.network);
    const attempts = attemptsIn(stdout.split('\n'), network, holders);

    const seen = canarySeen(attempts, canary);
    if (!seen.lookup || !seen.connection) {
      failed = true;
      console.error(
        `\n✗ The capture did not see the canary's ${
          seen.lookup
            ? 'connection'
            : seen.connection
              ? 'lookup'
              : 'lookup or connection'
        }, so a clean result would mean nothing. On Docker 26 and later an internal network's resolver no longer forwards names, which hides lookups from the bridge.`,
      );
    }
    const real = attempts.filter((attempt) => attempt.container !== canary);
    if (real.length > 0) {
      failed = true;
      console.error(
        `\n✗ ${real.length} attempt(s) to leave the machine:\n${formatAttempts(real)}`,
      );
    } else if (passError) {
      console.error(
        '\nNo container tried to leave, but the pass did not finish, so that covers only what ran.',
      );
    } else if (!failed) {
      console.log(
        '\n✓ No container tried to leave the machine during ingest and chat.',
      );
    }
  } finally {
    await run('docker', ['rm', '-f', watcher, canary], { quiet: true }).catch(
      () => undefined,
    );
    if (!options.keep) {
      await stack.compose(['down'], true, true).catch(() => undefined);
      // Every volume but the models, so the next run does not pull gigabytes.
      const { stdout } = await run(
        'docker',
        [
          'volume',
          'ls',
          '-q',
          '--filter',
          `label=com.docker.compose.project=${options.project}`,
        ],
        { quiet: true },
      );
      const volumes = stdout
        .split('\n')
        .filter((name) => name && !name.endsWith('_ollama_models'));
      if (volumes.length > 0) {
        await run('docker', ['volume', 'rm', ...volumes], { quiet: true });
      }
      rmSync(workdir, { recursive: true, force: true });
    } else {
      console.log(`\nLeft running as project ${options.project} (${workdir}).`);
    }
  }
  if (passError) {
    console.error('\n✗ The scripted pass did not complete:');
    throw passError;
  }
  process.exitCode = failed ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
