import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import {
  CANARY_ADDRESS,
  CANARY_HOST,
  DEFAULT_OPTIONS,
  applianceEnv,
  attemptsIn,
  canarySeen,
  composeIsRecentEnough,
  composeVersion,
  envValue,
  holderAt,
  inSubnet,
  recordHolders,
  modelsToPull,
  parseArgs,
  smallModelRouteTable,
  splitEndpoint,
  type Holder,
} from '../../scripts/appliance-egress-check.mts';

const REPO = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(REPO, file), 'utf8');

const network = { subnets: ['172.29.0.0/16'], gateways: ['172.29.0.1'] };
// Every timestamp below is in the window these two were seen holding their
// addresses.
const T0 = 1792270000_000;
const owners: Holder[] = [
  {
    ip: '172.29.0.2',
    name: 'ragen-egress-check-web-1',
    first: T0,
    last: T0 + 60_000,
  },
  {
    ip: '172.29.0.3',
    name: 'ragen-egress-check-postgres-1',
    first: T0,
    last: T0 + 60_000,
  },
];

// Lines as tcpdump writes them on the sealed bridge (`-nn -l -tttt`), taken
// from a run against Docker's resolver on an internal network.
const BRIDGE = {
  lookup:
    '1792270022.792841 IP 172.29.0.2.54662 > 192.168.65.7.53: 35064+ [1au] A? api.openai.com. (55)',
  lookupAgain:
    '1792270024.597055 IP 172.29.0.2.39033 > 192.168.65.7.53: 35064+ [1au] A? api.openai.com. (55)',
  syn: '1792270025.633756 IP 172.29.0.2.38384 > 1.1.1.1.80: Flags [S], seq 2742661476, win 64240, length 0',
  internal:
    '1792270028.787893 IP 172.29.0.2.41000 > 172.29.0.3.5432: Flags [S], seq 1, win 64240, length 0',
  reply:
    '1792270026.865229 IP 192.168.65.7.53 > 172.29.0.2.54662: 35064 ServFail- 0/0/0 (32)',
  multicast:
    '1792270020.740559 IP6 fe80::c26:acff:fec5:ef42 > ff02::2: ICMP6, router solicitation, length 16',
  toBridge:
    '1792270029.000000 IP 172.29.0.2.50000 > 172.29.0.1.11434: Flags [S], seq 1, win 64240, length 0',
};

describe('attemptsIn', () => {
  it('names the host a container looked up, once however often it asked', () => {
    expect(
      attemptsIn([BRIDGE.lookup, BRIDGE.lookupAgain], network, owners),
    ).toEqual([
      {
        container: 'ragen-egress-check-web-1',
        kind: 'dns',
        destination: 'api.openai.com',
        count: 2,
      },
    ]);
  });

  it('reports a connection to a literal address with its port', () => {
    expect(attemptsIn([BRIDGE.syn], network, owners)).toEqual([
      {
        container: 'ragen-egress-check-web-1',
        kind: 'tcp',
        destination: '1.1.1.1:80',
        count: 1,
      },
    ]);
  });

  it('counts a packet to the bridge itself, which is the host', () => {
    expect(attemptsIn([BRIDGE.toBridge], network, owners)).toEqual([
      expect.objectContaining({ destination: '172.29.0.1:11434' }),
    ]);
  });

  it('ignores traffic between containers, replies and link-local noise', () => {
    expect(
      attemptsIn(
        [BRIDGE.internal, BRIDGE.reply, BRIDGE.multicast, 'tcpdump: listening'],
        network,
        owners,
      ),
    ).toEqual([]);
  });

  it('still reports an attempt from a container that has gone', () => {
    const line = BRIDGE.syn.replace('172.29.0.2.38384', '172.29.0.9.38384');
    expect(attemptsIn([line], network, owners)).toEqual([
      expect.objectContaining({ container: 'unknown (172.29.0.9)' }),
    ]);
  });

  it('reads the interface-and-direction form of a capture on `any`', () => {
    const line =
      '1792270022.792841 eth0  Out IP 172.29.0.2.54662 > 192.168.65.7.53: 35064+ [1au] AAAA? api.openai.com. (55)';
    expect(attemptsIn([line], network, owners)).toEqual([
      expect.objectContaining({ kind: 'dns', destination: 'api.openai.com' }),
    ]);
  });
});

describe('canarySeen', () => {
  const canary = 'ragen-egress-check-canary';
  const canaryOwners: Holder[] = [
    { ip: '172.29.0.5', name: canary, first: T0, last: T0 + 60_000 },
  ];

  it('is true only when both the lookup and the connection were captured', () => {
    const lookup = `1792270022.0 IP 172.29.0.5.5000 > 192.168.65.7.53: 1+ A? ${CANARY_HOST}. (40)`;
    const connection = `1792270023.0 IP 172.29.0.5.5001 > ${CANARY_ADDRESS}.80: Flags [S], seq 1, win 1, length 0`;

    expect(
      canarySeen(
        attemptsIn([lookup, connection], network, canaryOwners),
        canary,
      ),
    ).toEqual({ lookup: true, connection: true });
    // A Docker whose resolver does not forward from an internal network:
    // the lookup never reaches the bridge, and the check must say so.
    expect(
      canarySeen(attemptsIn([connection], network, canaryOwners), canary),
    ).toEqual({ lookup: false, connection: true });
  });
});

describe('holderAt and recordHolders', () => {
  it('gives a reused address to whoever held it at that moment', () => {
    const holders: Holder[] = [];
    recordHolders(holders, new Map([['172.29.0.5', 'canary']]), 1_000);
    recordHolders(holders, new Map([['172.29.0.5', 'canary']]), 5_000);
    recordHolders(holders, new Map([['172.29.0.5', 'admin']]), 60_000);
    recordHolders(holders, new Map([['172.29.0.5', 'admin']]), 90_000);

    expect(holders).toHaveLength(2);
    expect(holderAt(holders, '172.29.0.5', 3_000)).toBe('canary');
    expect(holderAt(holders, '172.29.0.5', 70_000)).toBe('admin');
    // Between the two, the nearer sighting wins.
    expect(holderAt(holders, '172.29.0.5', 20_000)).toBe('canary');
    expect(holderAt(holders, '172.29.0.5', 50_000)).toBe('admin');
    // A packet just before the first sample still belongs to its container.
    expect(holderAt(holders, '172.29.0.5', 500)).toBe('canary');
    expect(holderAt(holders, '172.29.0.9', 3_000)).toBeUndefined();
  });
});

describe('splitEndpoint and inSubnet', () => {
  it.each([
    ['172.29.0.2.54662', { address: '172.29.0.2', port: '54662' }],
    ['1.1.1.1', { address: '1.1.1.1' }],
    ['192.168.65.7.53:', { address: '192.168.65.7', port: '53' }],
    ['2606:4700::1111.443', { address: '2606:4700::1111', port: '443' }],
  ])('splits %s', (endpoint, expected) => {
    expect(splitEndpoint(endpoint)).toEqual(expected);
  });

  it('places an address inside or outside a CIDR', () => {
    expect(inSubnet('172.29.0.2', '172.29.0.0/16')).toBe(true);
    expect(inSubnet('172.30.0.2', '172.29.0.0/16')).toBe(false);
    expect(inSubnet('10.0.0.1', '0.0.0.0/0')).toBe(true);
    expect(inSubnet('not-an-ip', '172.29.0.0/16')).toBe(false);
  });
});

describe('the environment and route table it runs', () => {
  it('fills the appliance example and appends what it does not have', () => {
    const env = applianceEnv('A=1\n# B=2\nC=\n', { C: 'x', D: 'y' });
    expect(env).toBe('A=1\n# B=2\nC=x\n\nD=y');
    expect(envValue(env, 'C')).toBe('x');
    expect(envValue(env, 'B')).toBeUndefined();
  });

  it('swaps every model in the real appliance table for the small pair', () => {
    const table = read('infra/llm-gateway/routes.appliance.yaml');
    const small = smallModelRouteTable(table, 'local-embed', DEFAULT_OPTIONS);
    const routes = (
      parse(small) as { routes: Record<string, { model: string }> }
    ).routes;

    // Every route the real table has, so none is left out of the check.
    expect(Object.keys(routes)).toEqual(
      Object.keys((parse(table) as { routes: object }).routes),
    );
    expect(routes['local-embed'].model).toBe(DEFAULT_OPTIONS.embedModel);
    expect(routes['local-chat'].model).toBe(DEFAULT_OPTIONS.chatModel);
    expect(routes['claude-haiku-4-5'].model).toBe(DEFAULT_OPTIONS.chatModel);
    expect(modelsToPull(small).sort()).toEqual(
      [DEFAULT_OPTIONS.chatModel, DEFAULT_OPTIONS.embedModel].sort(),
    );
  });

  it('refuses an embeddings route the table does not have', () => {
    expect(() =>
      smallModelRouteTable(
        'version: 1\nroutes: {}\n',
        'local-embed',
        DEFAULT_OPTIONS,
      ),
    ).toThrow(/not a route/);
  });

  it('reads the embeddings route from the appliance example itself', () => {
    expect(
      envValue(
        read('infra/appliance/appliance.env.example'),
        'EMBEDDINGS_MODEL',
      ),
    ).toBe('local-embed');
  });
});

describe('parseArgs', () => {
  it('defaults to the small-model local check', () => {
    expect(parseArgs([])).toEqual(DEFAULT_OPTIONS);
  });

  it('reads the flags', () => {
    expect(
      parseArgs([
        '--keep',
        '--full-models',
        '--project',
        'p',
        '--version',
        'sha-1',
      ]),
    ).toMatchObject({
      keep: true,
      fullModels: true,
      project: 'p',
      version: 'sha-1',
    });
  });

  it('refuses the hybrid profile rather than running the local check', () => {
    expect(() => parseArgs(['--profile', 'hybrid'])).toThrow(/not supported/);
    expect(parseArgs(['--profile', 'local'])).toEqual(DEFAULT_OPTIONS);
  });

  it('refuses an unknown flag and a missing value', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown option/);
    expect(() => parseArgs(['--project'])).toThrow(/needs a value/);
    expect(() => parseArgs(['--vector-size', 'x'])).toThrow(/positive integer/);
  });
});

describe('composeVersion and composeIsRecentEnough', () => {
  it.each([
    ['2.19.1', [2, 19, 1], false],
    ['v2.29.7-desktop.1', [2, 29, 7], true],
    ['2.24.0', [2, 24, 0], true],
    ['5.1.2', [5, 1, 2], true],
  ])('reads %s', (output, version, recent) => {
    expect(composeVersion(output)).toEqual(version);
    expect(composeIsRecentEnough(version)).toBe(recent);
  });

  it('reads nothing from output with no version', () => {
    expect(composeVersion('')).toBeUndefined();
  });
});
