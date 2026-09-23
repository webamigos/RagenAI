import { dirname, isAbsolute, join, normalize, sep } from 'node:path';

/**
 * `ragen brain …` — Ragen Brain from the terminal, read-only.
 *
 * The shape is SwarmVault's (`next`, `doctor`, `query`, `graph`), adapted:
 * Brain's truth is the installation's database, so every command asks the
 * public API (`/v1/brain/*`) with an API key and writes nothing back.
 * Approving, merging and publishing stay in the panel, where the reviewer
 * sees the sources and the access they are deciding about.
 */

export interface BrainDeps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  writeFile: (path: string, content: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  out: (message: string) => void;
  err: (message: string) => void;
}

const USAGE = [
  'Usage',
  '  ragen brain <command> [options]',
  '',
  'Commands',
  '  next                  the single most useful next step',
  '  doctor                check extraction, ownership, access and publication',
  '  findings              open findings, most severe first (--status RESOLVED|DISMISSED)',
  '  pages [search]        knowledge pages, optionally searched (--status CANDIDATE|APPROVED|STALE|REJECTED)',
  '  graph                 the pages as a graph (--focus <page-id> --hops 1|2 --budget 150|300|600|1000 --inferred)',
  '  export <dir>          write the curated bundle: markdown, graph.json, manifest.json',
  '',
  'Options',
  '  --url <api-url>       the Ragen API, e.g. https://api.example.com (or RAGEN_API_URL)',
  '  --api-key <key>       an API key of an owner or admin (or RAGEN_API_KEY)',
  '  --json                print the API response as JSON',
].join('\n');

type Flags = {
  values: Map<string, string>;
  switches: Set<string>;
  positional: string[];
};

const VALUE_FLAGS = new Set([
  '--url',
  '--api-key',
  '--status',
  '--focus',
  '--hops',
  '--budget',
]);

function parse(args: string[]): Flags {
  const flags: Flags = {
    values: new Map(),
    switches: new Set(),
    positional: [],
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (VALUE_FLAGS.has(arg)) {
      flags.values.set(arg, args[i + 1] ?? '');
      i++;
    } else if (arg.startsWith('--')) {
      flags.switches.add(arg);
    } else {
      flags.positional.push(arg);
    }
  }
  return flags;
}

export async function runBrain(
  args: string[],
  deps: BrainDeps,
): Promise<number> {
  const [command, ...rest] = args;
  if (
    !command ||
    command === 'help' ||
    command === '--help' ||
    command === '-h'
  ) {
    deps.out(USAGE);
    return command ? 0 : 1;
  }
  const flags = parse(rest);
  const url = (
    flags.values.get('--url') ??
    deps.env.RAGEN_API_URL ??
    ''
  ).replace(/\/+$/, '');
  const key = flags.values.get('--api-key') ?? deps.env.RAGEN_API_KEY ?? '';
  if (!url || !key) {
    deps.err(
      'Set RAGEN_API_URL and RAGEN_API_KEY (or pass --url and --api-key). The key must belong to an owner or admin of an organization with Brain on.',
    );
    return 1;
  }
  const json = flags.switches.has('--json');

  const get = async (
    path: string,
    query: Record<string, string | undefined> = {},
  ) => {
    const params = new URLSearchParams(
      Object.entries(query).filter((e): e is [string, string] => Boolean(e[1])),
    );
    const qs = params.toString();
    const res = await deps.fetch(
      `${url}/v1/brain/${path}${qs ? `?${qs}` : ''}`,
      {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      },
    );
    if (res.status === 404) {
      throw new Error(
        'Brain is not available for this key: it is off for the organization, or the key’s user is not an owner or admin.',
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('The API key was refused.');
    }
    if (!res.ok) {
      throw new Error(`The API answered ${res.status}.`);
    }
    return (await res.json()) as unknown;
  };

  try {
    switch (command) {
      case 'next':
        return await next(deps, await get('next'), json);
      case 'doctor':
        return await doctor(deps, await get('health'), json);
      case 'findings':
        return print(
          deps,
          await get('findings', { status: flags.values.get('--status') }),
          json,
          findingsTable,
        );
      case 'pages':
        return print(
          deps,
          await get('pages', {
            q: flags.positional.join(' ') || undefined,
            status: flags.values.get('--status'),
          }),
          json,
          pagesTable,
        );
      case 'graph':
        return print(
          deps,
          await get('graph', {
            focus: flags.values.get('--focus'),
            hops: flags.values.get('--hops'),
            budget: flags.values.get('--budget'),
            inferred: flags.switches.has('--inferred') ? '1' : undefined,
          }),
          json,
          graphSummary,
        );
      case 'export': {
        const dir = flags.positional[0];
        if (!dir) {
          deps.err('Name a directory: ragen brain export ./brain');
          return 1;
        }
        return await exportBundle(deps, dir, await get('export'));
      }
      default:
        deps.err(`Unknown brain command: ${command}\n\n${USAGE}`);
        return 1;
    }
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function print(
  deps: BrainDeps,
  body: unknown,
  json: boolean,
  render: (body: never) => string,
): number {
  deps.out(json ? JSON.stringify(body, null, 2) : render(body as never));
  return 0;
}

async function next(
  deps: BrainDeps,
  body: unknown,
  json: boolean,
): Promise<number> {
  if (json) {
    deps.out(JSON.stringify(body, null, 2));
    return 0;
  }
  const n = body as {
    message: string;
    path: string | null;
    command: string | null;
  };
  deps.out(n.message);
  if (n.path) {
    deps.out(`  Open: ${n.path}`);
  }
  if (n.command) {
    deps.out(`  Then: ${n.command}`);
  }
  return 0;
}

async function doctor(
  deps: BrainDeps,
  body: unknown,
  json: boolean,
): Promise<number> {
  const checks = body as {
    name: string;
    status: 'ok' | 'warning' | 'error';
    detail: string;
    hint: string | null;
  }[];
  if (json) {
    deps.out(JSON.stringify(checks, null, 2));
  } else {
    const mark = { ok: 'ok  ', warning: 'warn', error: 'FAIL' } as const;
    for (const c of checks) {
      deps.out(`${mark[c.status]}  ${c.name.padEnd(17)} ${c.detail}`);
      if (c.hint) {
        deps.out(`      ${''.padEnd(17)} → ${c.hint}`);
      }
    }
  }
  // Non-zero on an error, so `ragen brain doctor` can gate a script.
  return checks.some((c) => c.status === 'error') ? 1 : 0;
}

function findingsTable(
  rows: {
    id: string;
    type: string;
    severity: string;
    pages: { title: string }[];
  }[],
): string {
  if (rows.length === 0) {
    return 'No findings.';
  }
  return rows
    .map(
      (r) =>
        `${r.severity.padEnd(6)} ${r.type.padEnd(18)} ${r.pages.map((p) => p.title).join(' ↔ ') || '(a document)'}`,
    )
    .join('\n');
}

function pagesTable(
  rows: {
    id: string;
    title: string;
    status: string;
    type: string;
    published: boolean;
  }[],
): string {
  if (rows.length === 0) {
    return 'No pages.';
  }
  return rows
    .map(
      (r) =>
        `${r.status.padEnd(9)} ${r.published ? 'published ' : '          '} ${r.type.padEnd(8)} ${r.title}  (${r.id})`,
    )
    .join('\n');
}

function graphSummary(view: {
  shown: { nodes: number; edges: number };
  total: { nodes: number; edges: number };
  hiddenInferred: number;
  communities: { label: string; size: number }[];
  focus: string | null;
}): string {
  return [
    `${view.focus ? `Neighbourhood of ${view.focus}: ` : ''}showing ${view.shown.nodes} of ${view.total.nodes} pages and ${view.shown.edges} of ${view.total.edges} relations`,
    view.hiddenInferred > 0
      ? `${view.hiddenInferred} inferred relations hidden (--inferred to show)`
      : '',
    ...view.communities
      .filter((c) => c.size > 1)
      .slice(0, 10)
      .map((c) => `  group: ${c.label} (${c.size})`),
    'Use --json for nodes and edges.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Write the bundle's files under `dir`. A path from the server that would
 * land outside it — absolute, or climbing with `..` — is refused before
 * anything is written: the manifest's own contract forbids such paths, and
 * the CLI does not trust that a server kept it.
 */
async function exportBundle(
  deps: BrainDeps,
  dir: string,
  body: unknown,
): Promise<number> {
  const bundle = body as {
    files: Record<string, string>;
    skipped: { title: string; reason: string }[];
  };
  const entries = Object.entries(bundle.files);
  for (const [path] of entries) {
    const clean = normalize(path);
    if (
      isAbsolute(path) ||
      clean.startsWith('..') ||
      clean.split(sep).includes('..')
    ) {
      deps.err(`Refusing a bundle path outside the target directory: ${path}`);
      return 1;
    }
  }
  for (const [path, content] of entries) {
    const target = join(dir, normalize(path));
    await deps.mkdir(dirname(target));
    await deps.writeFile(target, content);
  }
  const pages = entries.filter(([p]) => p.endsWith('.md')).length;
  deps.out(`Wrote ${pages} pages, graph.json and manifest.json to ${dir}`);
  if (bundle.skipped.length > 0) {
    const reasons = new Map<string, number>();
    for (const s of bundle.skipped) {
      reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
    }
    deps.out(
      `Left out ${bundle.skipped.length}: ${[...reasons].map(([r, n]) => `${r} ${n}`).join(', ')}`,
    );
  }
  return 0;
}
