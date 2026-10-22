/**
 * The on-premises appliance: Ragen on one machine with its models served
 * locally, so no model call leaves it. Step C1 of
 * docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md.
 *
 * Nothing here invents configuration. The appliance already exists as files
 * in the repository — `infra/llm-gateway/routes.appliance.yaml`,
 * `docker-compose.appliance.yml` and `infra/appliance/appliance.env.example`
 * — and this module picks among them and writes them into a new install:
 *
 * - **the profile** is the set of compose files, written to `.env` as
 *   `COMPOSE_FILE` so every later `docker compose` addresses the same stack;
 * - **the route file** is the appliance table, copied over
 *   `infra/llm-gateway/routes.yaml` after checking that nothing in it leaves
 *   the machine;
 * - **the env** is the tier's model ids, `VECTOR_SIZE` and `DOCLING_STRICT=1`.
 *
 * Profiles and tiers are data, not branches. Hybrid (D3) is listed and not
 * available: the `appliance-hybrid` profile does not exist yet (A1b). Only
 * one tier exists, and it is not measured: the spec offers no tier before A5
 * has measured it on real hardware, so the one the Phase 0 and A1 files
 * configure is offered under its own name and says so.
 *
 * `tests/architecture/create-ragen-app-manifest-is-current.test.ts` holds the
 * tier to those files: its env keys exist in `.env.example`, its values match
 * the appliance template, its model ids are routes in its route file, and the
 * route file passes `findOffMachineRoutes`.
 */

export type ApplianceProfileId = 'local' | 'hybrid';

export interface ApplianceProfile {
  id: ApplianceProfileId;
  label: string;
  available: boolean;
  /** Why it cannot be chosen yet, for the wizard and for `--appliance=`. */
  unavailableReason?: string;
}

export const APPLIANCE_PROFILES: readonly ApplianceProfile[] = [
  {
    id: 'local',
    label: 'Local — every model on this machine, nothing leaves it',
    available: true,
  },
  {
    id: 'hybrid',
    label:
      'Hybrid — documents stay here, chat goes to one EU endpoint you choose',
    available: false,
    unavailableReason:
      'the appliance-hybrid profile does not exist yet (step A1b of the appliance spec)',
  },
];

export const DEFAULT_APPLIANCE_PROFILE: ApplianceProfileId = 'local';

export interface ApplianceTier {
  id: string;
  label: string;
  /**
   * False until A5 has measured this tier on real hardware. The wizard and
   * the outro say so, because a tier with no numbers is a guess about
   * whether the machine is big enough.
   */
  measured: boolean;
  /** The route file this tier uses, relative to the repository root. */
  routeFile: string;
  /** Compose files, in order, on top of which nothing else is needed. */
  composeFiles: readonly string[];
  /** Added after `composeFiles` on a host with an NVIDIA GPU. */
  gpuComposeFile: string;
  /**
   * The only `openai-compatible` connections the route file may use. Every
   * one of them is a server this install starts on the machine itself.
   */
  localConnections: readonly string[];
  /** What the first start downloads, for the confirm and the outro. */
  firstPullGb: number;
  /** Written to the root `.env.local`. Every key exists in `.env.example`. */
  envUpdates: Readonly<Record<string, string>>;
}

/**
 * The tier Phase 0 and A1 configured: Ollama, with the S/M-class models in
 * `routes.appliance.yaml`. Called `default` rather than S or M because which
 * hardware class it fits is exactly what A5 has not measured yet.
 */
export const APPLIANCE_TIERS: readonly ApplianceTier[] = [
  {
    id: 'default',
    label:
      'Default — Ollama: Bielik 11B, Qwen 2.5 7B, Gemma 3 12B, BGE-M3 (sizing not yet measured)',
    measured: false,
    routeFile: 'infra/llm-gateway/routes.appliance.yaml',
    composeFiles: [
      'docker-compose.yml',
      'docker-compose.fullapp.yml',
      'docker-compose.appliance.yml',
    ],
    gpuComposeFile: 'docker-compose.appliance.gpu.yml',
    localConnections: ['ollama'],
    firstPullGb: 20,
    envUpdates: {
      // The pricing namespace, not a gateway. A route that describes itself
      // costs nothing in usage reports (A2b) whatever this says.
      DEFAULT_MODEL_PROVIDER: 'litellm',
      DEFAULT_MODEL: 'local-chat',
      // Rephrase runs on every question and summaries on every upload, so
      // both take the small model. Brain, memory and section selection fall
      // back to these two when unset.
      REPHRASE_MODEL: 'local-small',
      SUMMARY_MODEL: 'local-small',
      SCORING_MODEL: 'local-small',
      // `.env.example` ships `mistral-small-3.2` here, which the appliance
      // table does not route: an image in chat would fail on "no route".
      MULTIMODAL_FALLBACK_MODEL: 'local-vision',
      // The two have to agree on web, api and worker, or Qdrant rejects
      // every upsert. bge-m3 writes 1024 dimensions.
      EMBEDDINGS_MODEL: 'local-embed',
      VECTOR_SIZE: '1024',
      // For an app run on the host. In the container stack
      // docker-compose.appliance.yml sets the service name instead, and its
      // `environment:` wins over `.env.local`.
      LLM_OLLAMA_BASE_URL: 'http://localhost:11434/v1',
      // Ollama ignores the key, but some clients refuse an empty bearer.
      LLM_OLLAMA_API_KEY: 'ollama',
      DOCUMENT_PARSER: 'docling',
      // Without it a failed Docling parse falls back to a loader that sends
      // the file to a cloud model.
      DOCLING_STRICT: '1',
    },
  },
];

export const DEFAULT_APPLIANCE_TIER = 'default';

export interface ApplianceSelection {
  profile: ApplianceProfile;
  tier: ApplianceTier;
  gpu: boolean;
  envUpdates: Record<string, string>;
  /** Every compose file this install runs, in order, GPU file included. */
  composeFiles: string[];
}

export function findApplianceProfile(id: string): ApplianceProfile | undefined {
  return APPLIANCE_PROFILES.find((profile) => profile.id === id);
}

export function findApplianceTier(id: string): ApplianceTier | undefined {
  return APPLIANCE_TIERS.find((tier) => tier.id === id);
}

export function availableApplianceProfiles(): ApplianceProfile[] {
  return APPLIANCE_PROFILES.filter((profile) => profile.available);
}

export function resolveApplianceSelection(
  profileId: ApplianceProfileId,
  tierId: string,
  { gpu }: { gpu: boolean },
): ApplianceSelection {
  const profile = findApplianceProfile(profileId);
  if (!profile) {
    throw new Error(`Unknown appliance profile: ${profileId}.`);
  }
  if (!profile.available) {
    // A guard, not a code path the wizard reaches: neither the prompt nor
    // `parseArgs` lets an unavailable profile through.
    throw new Error(
      `The ${profile.id} appliance profile is not available: ${profile.unavailableReason}.`,
    );
  }

  const tier = findApplianceTier(tierId);
  if (!tier) {
    throw new Error(`Unknown appliance tier: ${tierId}.`);
  }

  return {
    profile,
    tier,
    gpu,
    envUpdates: { ...tier.envUpdates },
    composeFiles: [...tier.composeFiles, ...(gpu ? [tier.gpuComposeFile] : [])],
  };
}

export interface ParsedRoute {
  name: string;
  provider: string | undefined;
  connection: string | undefined;
}

/**
 * The routes in a route table, read line by line.
 *
 * Not a YAML parser, and it does not need to be: route tables in this
 * repository are two-space indented maps (`routes:` → id → fields), the
 * gateway's own schema says so, and the package has no YAML dependency to
 * spend on a check this narrow. A table it cannot read yields no routes, and
 * `findOffMachineRoutes` treats that as a failure rather than a pass.
 *
 * An entry under `routes:` in any other shape — flow style
 * (`cloud: { provider: openai }`), another indent — comes back as a route
 * with no provider, so the check refuses it. Skipping it would let the
 * gateway, which does read it, send that model off the machine.
 */
export function parseRouteTable(yaml: string): ParsedRoute[] {
  const routes: ParsedRoute[] = [];
  let inRoutes = false;
  let current: ParsedRoute | undefined;

  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      continue;
    }
    if (/^\S/.test(line)) {
      inRoutes = /^routes:\s*$/.test(line);
      current = undefined;
      continue;
    }
    if (!inRoutes) {
      continue;
    }

    const id = /^ {2}([^\s:][^:]*):\s*$/.exec(line);
    if (id) {
      current = {
        name: id[1] as string,
        provider: undefined,
        connection: undefined,
      };
      routes.push(current);
      continue;
    }

    if (!/^ {4}/.test(line)) {
      routes.push({
        name: line.trim(),
        provider: undefined,
        connection: undefined,
      });
      current = undefined;
      continue;
    }

    const field = /^ {4}(provider|connection):\s*['"]?([^'"\s]+)['"]?\s*$/.exec(
      line,
    );
    if (field && current) {
      current[field[1] as 'provider' | 'connection'] = field[2];
    }
  }

  return routes;
}

/**
 * What in a route table would leave the machine, one line per problem.
 * Empty means every route is an `openai-compatible` route on one of the
 * tier's local connections.
 *
 * The appliance's whole promise is that nothing leaves the machine, and the
 * route file is cloned from whatever `--ref` names, so the wizard checks the
 * file it is about to install rather than trusting it. A table with no
 * readable routes is a problem too: "nothing found" is not "nothing leaves".
 */
export function findOffMachineRoutes(
  yaml: string,
  localConnections: readonly string[],
): string[] {
  const routes = parseRouteTable(yaml);
  if (routes.length === 0) {
    return ['no routes could be read from the table'];
  }

  return routes.flatMap(({ name, provider, connection }) => {
    if (provider !== 'openai-compatible') {
      return [
        `${name}: provider ${provider ?? '(none)'} is not a local server`,
      ];
    }
    if (!connection || !localConnections.includes(connection)) {
      return [
        `${name}: connection ${connection ?? '(none)'} is not one this install runs (${localConnections.join(', ')})`,
      ];
    }
    return [];
  });
}

/**
 * Model ids the tier's env selects that the route table does not route —
 * each would fail its first call with "no route for model".
 */
export function findUnroutedModels(
  yaml: string,
  envUpdates: Readonly<Record<string, string>>,
): string[] {
  const routed = new Set(parseRouteTable(yaml).map((route) => route.name));
  return Object.entries(envUpdates)
    .filter(([key]) => key.endsWith('_MODEL'))
    .map(([, model]) => model)
    .filter((model, index, all) => all.indexOf(model) === index)
    .filter((model) => !routed.has(model));
}

/**
 * The appliance table as this install's `infra/llm-gateway/routes.yaml`.
 *
 * A copy rather than an `LLM_ROUTES_PATH` pointing at the original, for the
 * reason `route-table.ts` gives: a relative path resolves against each app's
 * own cwd, and an absolute one breaks when the directory moves. The
 * container stack reads the original anyway — docker-compose.appliance.yml
 * sets `LLM_ROUTES_PATH` to it — so the copy is what an app started on the
 * host, or a stack started without the overlay, finds. Either way there is
 * no cloud table left in the install for anything to fall back to.
 */
export function renderApplianceRouteTable(
  sourceYaml: string,
  selection: ApplianceSelection,
): string {
  return [
    `# Written by create-ragen-app for an appliance install (profile: ${selection.profile.id}, tier: ${selection.tier.id}).`,
    '#',
    `# A copy of ${selection.tier.routeFile}, which the appliance's containers`,
    '# read directly. It replaces the shipped cloud table, so an app started on',
    '# the host, or a stack started without the appliance compose file, finds',
    '# no route that leaves this machine either. Change both files together.',
    '',
    sourceYaml,
  ].join('\n');
}

/**
 * `COMPOSE_FILE` for `.env`, joined the way Compose splits it: by the
 * platform's path-list separator (`:`, or `;` on Windows), which is Node's
 * `path.delimiter` on the same machine.
 */
export function composeFileValue(
  files: readonly string[],
  delimiter: string,
): string {
  return files.join(delimiter);
}
