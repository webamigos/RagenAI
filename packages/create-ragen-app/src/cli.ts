import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import * as clack from '@clack/prompts';
import { parse as parseDotenv } from 'dotenv';

import { DEFAULT_TARGET_DIR, parseArgs } from './args';
import { cloneRagenApp } from './clone';
import { applyEnvOverrides } from './env-file';
import { addLiteLLMModel, type LiteLLMModelEntry } from './litellm-config';
import { manualLlmSetupInstructions } from './manual-setup';
import {
  LLM_PROVIDERS,
  resolveLlmProviderChoice,
  type LlmProviderChoice,
  type LlmProviderChoiceResult,
} from './llm-provider';
import {
  entriesForTarget,
  MANIFEST,
  type EnvTarget,
  type ManifestEntry,
} from './manifest';
import { generateSecret } from './secrets';
import {
  generatePrismaClient,
  installDependencies,
  isDockerAvailable,
  migrateDatabase,
  ragenStackVolumeExists,
  seedDatabase,
  startDockerServices,
} from './tasks';

/** Written into the new install whenever a model still has to be wired by hand. */
const MANUAL_SETUP_FILENAME = 'SETUP-LLM.md';

const ENV_PATHS: Record<EnvTarget, { example: string; local: string }> = {
  root: { example: '.env.example', local: '.env.local' },
  admin: { example: 'apps/admin/.env.example', local: 'apps/admin/.env.local' },
};

/**
 * `promptLlmProvider`'s three outcomes — a real choice, an explicit "I'll
 * configure LiteLLM myself", and the user cancelling the prompt (Ctrl+C /
 * Escape) — must stay distinguishable. Collapsing cancel into skip used to
 * mean pressing Ctrl+C here silently fell through to writing env files,
 * starting Docker and running migrations, instead of stopping like every
 * other cancellable prompt in this CLI does.
 */
type LlmProviderPromptResult =
  | { cancelled: true }
  | { cancelled: false; choice: LlmProviderChoiceResult | undefined };

export async function run(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  clack.intro('create-ragen-app');

  const targetDir = await resolveTargetDir(args.targetDir, args.yes);
  if (!targetDir) {
    return;
  }

  const cloneSpinner = clack.spinner();
  cloneSpinner.start(`Cloning Ragen into ${targetDir}`);
  try {
    await cloneRagenApp(targetDir, args.ref);
  } catch (error) {
    cloneSpinner.stop('Clone failed.', 1);
    clack.cancel(
      `Could not download ${args.ref} from the Ragen repository: ${String(error)}`,
    );
    return;
  }
  cloneSpinner.stop('Cloned.');

  const resolvedValues = resolveManifestValues();
  const rootOverrides = overridesForTarget('root', resolvedValues);
  const adminOverrides = overridesForTarget('admin', resolvedValues);

  const llmPrompt: LlmProviderPromptResult = args.yes
    ? { cancelled: false, choice: undefined }
    : await promptLlmProvider();

  if (llmPrompt.cancelled) {
    clack.cancel('Cancelled.');
    return;
  }

  const llmChoice = llmPrompt.choice;
  if (llmChoice) {
    Object.assign(rootOverrides, llmChoice.envUpdates);
  }

  const rootWrite = writeEnvFile(targetDir, 'root', rootOverrides);
  const adminWrite = writeEnvFile(targetDir, 'admin', adminOverrides);

  const missingKeys = [...rootWrite.missingKeys, ...adminWrite.missingKeys];
  if (missingKeys.length > 0) {
    clack.cancel(
      [
        `Wrote what could be matched, but these keys have no line in the cloned repo's .env.example: ${missingKeys.join(', ')}.`,
        "That usually means create-ragen-app's manifest and the repo have drifted — fix them by hand in .env.local before starting the app. Stopping before Docker/migrations, since they'd run against an incomplete config.",
      ].join('\n'),
    );
    return;
  }

  if (llmChoice) {
    patchLiteLLMConfig(targetDir, llmChoice.liteLLMEntries);

    if (!llmChoice.embeddingsConfigured) {
      clack.log.warn(
        [
          'Chat is configured, but this provider has no embeddings API — the',
          'knowledge base will not work until you add one. See',
          `${MANUAL_SETUP_FILENAME} in the new directory.`,
        ].join(' '),
      );
      writeManualSetupGuide(targetDir);
    }
  } else {
    // Declining to paste a provider key into someone else's CLI is
    // reasonable, so this path has to leave a person able to finish by hand
    // rather than just telling them something is broken.
    const guidePath = writeManualSetupGuide(targetDir);
    clack.note(
      [
        'No LLM provider configured, so chat and the knowledge base are off.',
        '',
        'Two files to edit, then `docker compose restart litellm`:',
        '  .env.local              — your key, DEFAULT_MODEL, REPHRASE_MODEL,',
        '                            EMBEDDINGS_MODEL, VECTOR_SIZE',
        '  infra/litellm/config.yaml — a model_list entry per model',
        '',
        `Exact values for OpenAI and Anthropic are written to ${guidePath}.`,
      ].join('\n'),
      'Configure a model later',
    );
  }

  if (!args.skipDocker) {
    if (!(await maybeStartDocker(targetDir, args.yes))) {
      return;
    }
  }

  if (!args.skipInstall) {
    // prisma.config.ts reads DATABASE_URL from process.env directly, and
    // unlike `npm run db:seed` (tsx --env-file=.env.local), plain
    // `npm run generate:types` / `npx prisma migrate deploy` don't load
    // .env.local themselves — so the values just written have to be passed
    // through explicitly.
    const rootEnv = parseDotenv(rootWrite.content);
    if (!(await maybeRunFirstTimeSetup(targetDir, args.yes, rootEnv))) {
      return;
    }
  }

  clack.outro(
    [
      'Done. Next steps:',
      `  cd ${targetDir}`,
      '  npm run api:dev     # in one terminal',
      '  npm run web:dev     # in another',
      '',
      // Both, not just web: apps/web delegates thread creation, the thread
      // sidebar and notifications to apps/api (ADR-21), so starting only the
      // web app gets you a panel that loads and a chat that cannot open a
      // thread.
      'apps/api is not optional — the web app creates threads through it,',
      'so chat fails without it.',
      '',
      'App:   http://localhost:3000',
      'API:   http://localhost:3001',
      'Admin: http://localhost:3200  (npm run admin:dev)',
      '',
      'Anything skipped above (S3 storage, encryption, Stripe, email, MCP',
      'connectors) is documented in docs/self-hosting.',
    ].join('\n'),
  );
}

async function resolveTargetDir(
  given: string | undefined,
  yes: boolean,
): Promise<string | undefined> {
  let targetDir = given;

  if (!targetDir) {
    if (yes) {
      targetDir = DEFAULT_TARGET_DIR;
    } else {
      const answer = await clack.text({
        message: 'Where should Ragen be created?',
        placeholder: DEFAULT_TARGET_DIR,
        defaultValue: DEFAULT_TARGET_DIR,
      });

      if (clack.isCancel(answer)) {
        clack.cancel('Cancelled.');
        return undefined;
      }

      targetDir = answer || DEFAULT_TARGET_DIR;
    }
  }

  if (existsSync(targetDir)) {
    const stats = statSync(targetDir);
    if (!stats.isDirectory()) {
      clack.cancel(`${targetDir} already exists and is not a directory.`);
      return undefined;
    }
    if (readdirSync(targetDir).length > 0) {
      clack.cancel(`${targetDir} already exists and is not empty.`);
      return undefined;
    }
  }

  return targetDir;
}

/**
 * Resolves each manifest entry once, so an entry listing more than one
 * target (e.g. INTERNAL_API_SECRET, shared by root and apps/admin) writes
 * the same value to all of them, while two independent entries for the same
 * key (BETTER_AUTH_SECRET in root vs. admin) resolve independently.
 */
function resolveManifestValues(): Map<ManifestEntry, string> {
  const resolved = new Map<ManifestEntry, string>();
  for (const entry of MANIFEST) {
    resolved.set(
      entry,
      entry.strategy === 'generate-secret' ? generateSecret() : entry.value,
    );
  }
  return resolved;
}

function overridesForTarget(
  target: EnvTarget,
  resolved: Map<ManifestEntry, string>,
): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const entry of entriesForTarget(target)) {
    overrides[entry.key] = resolved.get(entry) as string;
  }
  return overrides;
}

interface WriteEnvFileResult {
  content: string;
  missingKeys: string[];
}

function writeEnvFile(
  targetDir: string,
  target: EnvTarget,
  overrides: Record<string, string>,
): WriteEnvFileResult {
  const paths = ENV_PATHS[target];
  const examplePath = join(targetDir, paths.example);
  const localPath = join(targetDir, paths.local);

  const template = readFileSync(examplePath, 'utf8');
  const { content, missingKeys } = applyEnvOverrides(template, overrides);
  // Holds every generated secret plus any pasted API key — owner-only.
  writeFileSync(localPath, content, { mode: 0o600 });

  return { content, missingKeys };
}

async function promptLlmProvider(): Promise<LlmProviderPromptResult> {
  const choice = await clack.select({
    message: 'Which LLM provider should power chat?',
    options: [
      { value: 'openai' as const, label: LLM_PROVIDERS.openai.label },
      { value: 'anthropic' as const, label: LLM_PROVIDERS.anthropic.label },
      { value: 'skip' as const, label: "I'll configure LiteLLM myself" },
    ],
  });

  if (clack.isCancel(choice)) {
    return { cancelled: true };
  }
  if (choice === 'skip') {
    return { cancelled: false, choice: undefined };
  }

  const apiKey = await clack.password({
    message: `Paste your ${LLM_PROVIDERS[choice as LlmProviderChoice].label} API key`,
  });

  if (clack.isCancel(apiKey)) {
    return { cancelled: true };
  }
  if (!apiKey) {
    return { cancelled: false, choice: undefined };
  }

  return {
    cancelled: false,
    choice: resolveLlmProviderChoice(choice as LlmProviderChoice, apiKey),
  };
}

function patchLiteLLMConfig(
  targetDir: string,
  entries: LiteLLMModelEntry[],
): void {
  const configPath = join(targetDir, 'infra/litellm/config.yaml');
  const patched = entries.reduce(
    (config, entry) => addLiteLLMModel(config, entry),
    readFileSync(configPath, 'utf8'),
  );
  writeFileSync(configPath, patched);
}

/**
 * Leaves the manual instructions on disk as well as on screen. A terminal
 * that has just scrolled a `docker compose` build past them is exactly the
 * moment someone needs them, and a file survives that.
 */
function writeManualSetupGuide(targetDir: string): string {
  const path = join(targetDir, MANUAL_SETUP_FILENAME);
  writeFileSync(path, manualLlmSetupInstructions());
  return path;
}

async function confirmOrSkip(message: string, yes: boolean): Promise<boolean> {
  if (yes) {
    return true;
  }
  const answer = await clack.confirm({ message });
  return !clack.isCancel(answer) && answer;
}

/**
 * Runs one setup step under a spinner, turning a rejection into a stopped
 * spinner plus a clean `clack.cancel()` instead of letting it reach
 * `src/index.ts`'s generic catch — which would leave the spinner "running"
 * forever and print a raw stack trace. Returns whether the caller should
 * keep going.
 */
async function runStep(
  spinner: ReturnType<typeof clack.spinner>,
  label: string,
  successMessage: string,
  task: () => Promise<void>,
): Promise<boolean> {
  spinner.start(label);
  try {
    await task();
  } catch (error) {
    spinner.stop(`${label} — failed.`, 1);
    clack.cancel(String(error));
    return false;
  }
  spinner.stop(successMessage);
  return true;
}

async function maybeStartDocker(
  targetDir: string,
  yes: boolean,
): Promise<boolean> {
  // Before the confirm, not after: sharing a database with an install you
  // already depend on is the kind of thing to decline, and you can only
  // decline it if you are told first.
  if (await ragenStackVolumeExists()) {
    clack.log.warn(
      [
        'This machine already runs a Ragen stack, and docker-compose.yml pins',
        'container, volume and network names globally — so starting this one',
        'would reuse the existing Postgres and Qdrant data, not create its own.',
        '',
        'To keep them apart, answer no here and start the stack yourself with a',
        'distinct name:',
        '',
        `  cd ${targetDir} && RAGEN_STACK_NAME=my-ragen docker compose up -d`,
        '',
        'Then point DATABASE_URL in .env.local at that stack before migrating.',
      ].join('\n'),
    );
  }

  const proceed = await confirmOrSkip(
    'Start the backing services now? (Postgres, Qdrant, Temporal, LiteLLM, Redis, …)',
    yes,
  );
  if (!proceed) {
    return true;
  }

  if (!(await isDockerAvailable())) {
    clack.log.warn(
      'Docker does not seem to be available — skipping. Install Docker and run `docker compose up -d` yourself.',
    );
    return true;
  }

  return runStep(
    clack.spinner(),
    'Starting docker compose (Postgres, Qdrant, Temporal, LiteLLM, Redis, …)',
    'Backing services started.',
    () => startDockerServices({ cwd: targetDir }),
  );
}

async function maybeRunFirstTimeSetup(
  targetDir: string,
  yes: boolean,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  const proceed = await confirmOrSkip(
    'Install dependencies and run first-time setup (prisma generate, migrate, seed)?',
    yes,
  );
  if (!proceed) {
    return true;
  }

  const spinner = clack.spinner();

  const steps: Array<[string, string, () => Promise<void>]> = [
    [
      'npm install',
      'Dependencies installed.',
      () => installDependencies({ cwd: targetDir }),
    ],
    [
      'Generating the Prisma client',
      'Prisma client generated.',
      () => generatePrismaClient({ cwd: targetDir, env }),
    ],
    [
      'Applying database migrations',
      'Migrations applied.',
      () => migrateDatabase({ cwd: targetDir, env }),
    ],
    [
      'Seeding the database',
      'Database seeded.',
      () => seedDatabase({ cwd: targetDir, env }),
    ],
  ];

  for (const [label, successMessage, task] of steps) {
    if (!(await runStep(spinner, label, successMessage, task))) {
      return false;
    }
  }

  return true;
}
