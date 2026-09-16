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

import { DEFAULT_TARGET_DIR, parseArgs, type CliArgs } from './args';
import { cloneRagenApp } from './clone';
import { writeRagenConfig } from './config-file';
import {
  ENCRYPTION_LABELS,
  resolveEncryptionSelection,
  type EncryptionChoice,
  type EncryptionSelection,
} from './encryption-provider';
import { applyEnvOverrides } from './env-file';
import { manualLlmSetupInstructions } from './manual-setup';
import { ROUTE_TABLE_PATH, writeRouteTable } from './route-table';
import { checkNodeVersion } from './node-version';
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
import {
  resolvePiiMaskingSelection,
  PII_COMPOSE_PROFILE,
  type PiiMaskingSelection,
} from './pii-masking';
import { generateSecret } from './secrets';
import {
  resolveStorageSelection,
  STORAGE_LABELS,
  type StorageSelection,
} from './storage-provider';
import {
  DEFAULT_TEMPORAL_SERVER_ADDRESS,
  resolveWorkerRuntimeSelection,
  WORKER_RUNTIME_LABELS,
  type WorkerRuntimeSelection,
} from './worker-runtime';
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
 * configure the route table myself", and the user cancelling the prompt (Ctrl+C /
 * Escape) — must stay distinguishable. Collapsing cancel into skip used to
 * mean pressing Ctrl+C here silently fell through to writing env files,
 * starting Docker and running migrations, instead of stopping like every
 * other cancellable prompt in this CLI does.
 */
type LlmProviderPromptResult =
  | { cancelled: true }
  | { cancelled: false; choice: LlmProviderChoiceResult | undefined };

/**
 * Returns whether the install ran to completion, so `index.ts` can exit
 * non-zero when it did not. Every `clack.cancel()` above used to `return`
 * into a resolved promise and a zero exit code — an aborted install looked
 * like a successful one to anything reading `$?`, which is a shell `&&`, a
 * Dockerfile, and the CI job that exists to catch exactly this.
 */
export async function run(argv: string[]): Promise<boolean> {
  const args = parseArgs(argv);

  clack.intro('create-ragen-app');

  // Before the target directory, and well before the clone: the point of the
  // check is to cost nothing when it fails.
  const nodeVersion = checkNodeVersion({
    version: process.version,
    willRunSetup: !args.skipInstall,
  });

  if (nodeVersion.kind === 'refuse') {
    clack.cancel(nodeVersion.message);
    return false;
  }

  if (nodeVersion.kind === 'warn') {
    clack.log.warn(nodeVersion.message);
  }

  const targetDir = await resolveTargetDir(args.targetDir, args.yes);
  if (!targetDir) {
    return false;
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
    return false;
  }
  cloneSpinner.stop('Cloned.');

  const resolvedValues = resolveManifestValues();
  const rootOverrides = overridesForTarget('root', resolvedValues);
  const adminOverrides = overridesForTarget('admin', resolvedValues);

  const llmPrompt = await resolveLlmProvider(args);

  if (llmPrompt.cancelled) {
    clack.cancel('Cancelled.');
    return false;
  }

  const llmChoice = llmPrompt.choice;
  if (llmChoice) {
    Object.assign(rootOverrides, llmChoice.envUpdates);
  }

  // Storage and encryption were skipped by every earlier version of this
  // wizard, and both are worse to answer later than now: turning encryption on
  // afterwards leaves everything already written in plaintext, because nothing
  // re-encrypts history, and moving storage strands the files already uploaded.
  const storagePrompt = await resolveStorage(args);
  if (storagePrompt.cancelled) {
    clack.cancel('Cancelled.');
    return false;
  }

  const encryptionPrompt = await resolveEncryption(args);
  if (encryptionPrompt.cancelled) {
    clack.cancel('Cancelled.');
    return false;
  }

  const piiPrompt = await resolvePiiMasking(args);
  if (piiPrompt.cancelled) {
    clack.cancel('Cancelled.');
    return false;
  }
  const piiMasking = piiPrompt.selection;
  Object.assign(rootOverrides, piiMasking.envUpdates);

  // Asked here rather than left to an env edit, because choosing BullMQ is
  // also what configures the queue dashboard — and an install that picked the
  // runtime but not the dashboard would have no view of its own queues, which
  // is what the Temporal UI gave away for free.
  const runtimePrompt = await resolveWorkerRuntime(args);
  if (runtimePrompt.cancelled) {
    clack.cancel('Cancelled.');
    return false;
  }
  const workerRuntime = runtimePrompt.selection;
  Object.assign(rootOverrides, workerRuntime.envUpdates);

  const storage = storagePrompt.selection;
  const encryption = encryptionPrompt.selection;

  Object.assign(rootOverrides, storage.envUpdates, encryption.envUpdates);

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
    return false;
  }

  // After the env write, so a run that stops on drifted keys has not already
  // rewritten a file in the clone.
  try {
    writeRagenConfig(targetDir, storage, encryption);
  } catch (error) {
    clack.cancel(
      `Could not update ragen.config.ts: ${String(error)}\n` +
        'The environment is written and correct; only the typed config is out of date. Fix its storage/encryption block by hand.',
    );
    return false;
  }

  if (encryption.generatedKey) {
    clack.log.info(
      [
        'Generated an encryption key into .env.local as ENCRYPTION_MASTER_KEY.',
        'Back it up: messages and documents encrypted with it cannot be read',
        'without it, and nothing can re-derive it.',
      ].join(' '),
    );
  }

  if (encryption.provider === 'none') {
    clack.log.warn(
      [
        'Encryption is off, so messages and documents are stored in plaintext.',
        'Turning it on later leaves everything written before then unencrypted —',
        'nothing re-encrypts history.',
      ].join(' '),
    );
  }

  if (llmChoice) {
    // The route table is the whole of it now: B6 removed the proxy, so there
    // is no second file to keep in step and no rollback that needs one.
    writeRouteTable(targetDir, llmChoice.routes);

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
        'Two files to edit:',
        '  .env.local                    — your key, DEFAULT_MODEL,',
        '                                  REPHRASE_MODEL, EMBEDDINGS_MODEL,',
        '                                  VECTOR_SIZE',
        `  ${ROUTE_TABLE_PATH} — a route per model`,
        '',
        `Exact values for OpenAI and Anthropic are written to ${guidePath}.`,
      ].join('\n'),
      'Configure a model later',
    );
  }

  let dockerFailed = false;
  if (!args.skipDocker) {
    ({ failed: dockerFailed } = await maybeStartDocker(
      targetDir,
      args.yes,
      piiMasking.composeProfiles,
    ));
  }

  if (!args.skipInstall) {
    // prisma.config.ts reads DATABASE_URL from process.env directly, and
    // unlike `npm run db:seed` (tsx --env-file=.env.local), plain
    // `npm run generate:types` / `npx prisma migrate deploy` don't load
    // .env.local themselves — so the values just written have to be passed
    // through explicitly.
    const rootEnv = parseDotenv(rootWrite.content);
    if (
      !(await maybeRunFirstTimeSetup(
        targetDir,
        args.yes,
        rootEnv,
        dockerFailed,
      ))
    ) {
      return false;
    }
  }

  // Printed before the outro, and printed at all because it is the only time
  // this value is readable: it is written to .env.local and never shown again.
  if (piiMasking.enabled) {
    clack.log.info(
      "PII masking is on. Presidio sits behind compose's `" +
        PII_COMPOSE_PROFILE +
        '` profile, so start the stack with `docker compose --profile ' +
        PII_COMPOSE_PROFILE +
        ' up -d` — a plain `up` skips those two containers and the app would ' +
        'point at services nobody started.',
    );
  }

  if (workerRuntime.dashboard) {
    const { user, password, port } = workerRuntime.dashboard;
    clack.note(
      [
        `http://localhost:${port}`,
        `user:     ${user}`,
        `password: ${password}`,
        '',
        'Generated for this install and written to .env.local. It is not a',
        'shared default — every install gets its own — so save it now if you',
        'want it somewhere other than that file.',
      ].join('\n'),
      'Queue dashboard',
    );
  }

  clack.outro(
    [
      'Done. Next steps:',
      `  cd ${targetDir}`,
      '  npm run api:dev     # in one terminal',
      '  npm run web:dev     # in another',
      '  npm run worker:dev  # in a third — document ingest runs here',
      '',
      // Both, not just web: apps/web delegates thread creation, the thread
      // sidebar and notifications to apps/api (ADR-21), so starting only the
      // web app gets you a panel that loads and a chat that cannot open a
      // thread.
      'apps/api is not optional — the web app creates threads through it,',
      'so chat fails without it. Without the worker an upload is accepted and',
      'never parsed: the queue fills and nothing drains it.',
      '',
      'App:   http://localhost:3000',
      'API:   http://localhost:3001',
      'Admin: http://localhost:3200  (npm run admin:dev)',
      '',
      'Anything skipped above (S3 storage, encryption, Stripe, email, MCP',
      'connectors) is documented in docs/self-hosting.',
    ].join('\n'),
  );

  return true;
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

type StoragePromptResult =
  { cancelled: true } | { cancelled: false; selection: StorageSelection };

type EncryptionPromptResult =
  { cancelled: true } | { cancelled: false; selection: EncryptionSelection };

/**
 * Whether the wizard may ask anything at all.
 *
 * `--yes` is the obvious one. `--provider=` is the other, and it is not
 * obvious: that flag exists so CI can run this wizard, *because CI cannot
 * answer a prompt*. Adding a question that `--provider` does not silence would
 * hang every automated install — the flag's whole purpose, undone by a
 * question about buckets.
 *
 * A person who would rather not type an API key into a CLI, and does want to
 * be asked about storage, omits the flag and exports the key instead.
 */
function isUnattended(args: CliArgs): boolean {
  return args.yes || args.provider !== undefined;
}

/**
 * Unattended installs take the shipped defaults: files on disk (ADR-27) and a
 * generated encryption key.
 *
 * Encryption is *on* in that path on purpose. The alternative defaults an
 * install to plaintext, and the only cost of the key is a line in `.env.local`
 * the wizard writes itself — where the cost of not having it is that every
 * message written before someone thinks to turn it on stays readable forever.
 */
async function resolveStorage(args: CliArgs): Promise<StoragePromptResult> {
  if (isUnattended(args)) {
    return { cancelled: false, selection: resolveStorageSelection('local') };
  }
  return promptStorage();
}

type PiiPromptResult =
  { cancelled: true } | { cancelled: false; selection: PiiMaskingSelection };

/**
 * Unattended installs get no PII masking, which is the shipped default.
 *
 * Presidio is two containers behind compose's `pii` profile and the analyzer
 * alone is the stack's largest memory consumer — 959 MB idle. Turning that on
 * for anyone who passed `--yes` would nearly double what a trial install needs
 * to run, for a feature most evaluations never reach.
 */
async function resolvePiiMasking(args: CliArgs): Promise<PiiPromptResult> {
  if (isUnattended(args)) {
    return { cancelled: false, selection: resolvePiiMaskingSelection(false) };
  }

  const enabled = await clack.confirm({
    message:
      'Mask personal data in documents with Presidio? (adds two containers, ~1 GB)',
    initialValue: false,
  });

  if (clack.isCancel(enabled)) {
    return { cancelled: true };
  }

  return {
    cancelled: false,
    selection: resolvePiiMaskingSelection(enabled === true),
  };
}

async function resolveEncryption(
  args: CliArgs,
): Promise<EncryptionPromptResult> {
  if (isUnattended(args)) {
    return { cancelled: false, selection: resolveEncryptionSelection('local') };
  }
  return promptEncryption();
}

type WorkerRuntimePromptResult =
  { cancelled: true } | { cancelled: false; selection: WorkerRuntimeSelection };

/**
 * Unattended installs take BullMQ, the shipped default.
 *
 * The reasoning did not change when the answer did: `--yes` means "accept the
 * defaults", not "pick an engine on the operator's behalf". It used to answer
 * Temporal because that is what the compose file ran; ADR-44 took Temporal out
 * of it, so answering Temporal now would scaffold an install whose worker
 * connects to a server nobody started. An install that wants durable execution
 * answers the prompt, and brings its own address with it.
 */
async function resolveWorkerRuntime(
  args: CliArgs,
): Promise<WorkerRuntimePromptResult> {
  if (isUnattended(args)) {
    return {
      cancelled: false,
      selection: resolveWorkerRuntimeSelection('bullmq'),
    };
  }
  return promptWorkerRuntime();
}

async function promptWorkerRuntime(): Promise<WorkerRuntimePromptResult> {
  const choice = await clack.select({
    message: 'Which engine should run background jobs?',
    // BullMQ first, because clack's first option is the one a bare Enter
    // takes — and it is the one this install's compose file can actually run.
    options: (['bullmq', 'temporal'] as const).map((value) => ({
      value,
      label: WORKER_RUNTIME_LABELS[value],
    })),
  });

  if (clack.isCancel(choice)) {
    return { cancelled: true };
  }

  if (choice !== 'temporal') {
    return {
      cancelled: false,
      selection: resolveWorkerRuntimeSelection('bullmq'),
    };
  }

  // Asked rather than defaulted, because the answer stopped being local.
  // Temporal left the compose file with ADR-44, so this address names a server
  // the operator runs; `localhost:7233` is right on a laptop and silent
  // everywhere else — a deployed worker pointing at its own container connects
  // to nothing and processes nothing, with no error to read.
  clack.log.warn(
    [
      'Temporal is not in this install’s docker-compose.yml (ADR-44) — it is an',
      'adapter now, and you run the server yourself. Nothing below starts one.',
    ].join(' '),
  );

  const address = await clack.text({
    message: 'Temporal server address?',
    initialValue: DEFAULT_TEMPORAL_SERVER_ADDRESS,
    placeholder: DEFAULT_TEMPORAL_SERVER_ADDRESS,
  });

  if (clack.isCancel(address)) {
    return { cancelled: true };
  }

  return {
    cancelled: false,
    selection: resolveWorkerRuntimeSelection('temporal', {
      temporalServerAddress: String(address),
    }),
  };
}

async function promptStorage(): Promise<StoragePromptResult> {
  const choice = await clack.select({
    message: 'Where should uploaded documents be stored?',
    options: (['local', 's3'] as const).map((value) => ({
      value,
      label: STORAGE_LABELS[value],
    })),
  });

  if (clack.isCancel(choice)) {
    return { cancelled: true };
  }
  if (choice === 'local') {
    return { cancelled: false, selection: resolveStorageSelection('local') };
  }

  const bucket = await clack.text({
    message: 'Bucket name',
    validate: (value) => (value.trim() ? undefined : 'Required for S3.'),
  });
  if (clack.isCancel(bucket)) {
    return { cancelled: true };
  }

  const region = await clack.text({
    message: 'Region',
    placeholder: 'fr-par, us-east-1, auto',
    validate: (value) => (value.trim() ? undefined : 'Required for S3.'),
  });
  if (clack.isCancel(region)) {
    return { cancelled: true };
  }

  const endpoint = await clack.text({
    message: 'Endpoint URL (blank for AWS)',
    placeholder: 'https://s3.fr-par.scw.cloud',
    defaultValue: '',
  });
  if (clack.isCancel(endpoint)) {
    return { cancelled: true };
  }

  const accessKeyId = await clack.text({
    message: 'Access key ID',
    validate: (value) => (value.trim() ? undefined : 'Required for S3.'),
  });
  if (clack.isCancel(accessKeyId)) {
    return { cancelled: true };
  }

  // password, not text: this one is a secret and should not be echoed into a
  // terminal someone may be sharing or recording.
  const secretAccessKey = await clack.password({
    message: 'Secret access key',
  });
  if (clack.isCancel(secretAccessKey)) {
    return { cancelled: true };
  }
  if (!secretAccessKey.trim()) {
    clack.log.warn('No secret key given — falling back to local storage.');
    return { cancelled: false, selection: resolveStorageSelection('local') };
  }

  return {
    cancelled: false,
    selection: resolveStorageSelection('s3', {
      bucket,
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
    }),
  };
}

async function promptEncryption(): Promise<EncryptionPromptResult> {
  const choice = await clack.select({
    message: 'Encrypt messages and documents at rest?',
    options: (['local', 'scaleway', 'kms', 'none'] as const).map((value) => ({
      value,
      label: ENCRYPTION_LABELS[value],
    })),
  });

  if (clack.isCancel(choice)) {
    return { cancelled: true };
  }

  const provider = choice as EncryptionChoice;
  if (provider === 'none' || provider === 'local') {
    return {
      cancelled: false,
      selection: resolveEncryptionSelection(provider),
    };
  }

  const keyId = await clack.text({
    message: provider === 'kms' ? 'KMS key id or ARN' : 'Key Manager key id',
    validate: (value) => (value.trim() ? undefined : 'Required.'),
  });
  if (clack.isCancel(keyId)) {
    return { cancelled: true };
  }

  if (provider === 'kms') {
    return {
      cancelled: false,
      selection: resolveEncryptionSelection('kms', { keyId, apiKey: '' }),
    };
  }

  // Validated rather than given a fallback, unlike the S3 secret: someone who
  // chose Scaleway has no second choice to fall back to, and a blank key would
  // write `SCW_API_KEY=` — a provider named with a credential that reads as
  // unset, which the boot check then refuses.
  const apiKey = await clack.password({
    message: 'Scaleway API secret key',
    validate: (value) => (value.trim() ? undefined : 'Required for Scaleway.'),
  });
  if (clack.isCancel(apiKey)) {
    return { cancelled: true };
  }

  return {
    cancelled: false,
    selection: resolveEncryptionSelection('scaleway', { keyId, apiKey }),
  };
}

/**
 * Three ways to arrive at a provider, in precedence order: named on the
 * command line with the key in the environment, declined wholesale by
 * `--yes`, or asked for.
 */
async function resolveLlmProvider(
  args: CliArgs,
): Promise<LlmProviderPromptResult> {
  if (args.provider) {
    return providerFromEnvironment(args.provider);
  }
  if (args.yes) {
    return { cancelled: false, choice: undefined };
  }
  return promptLlmProvider();
}

/**
 * `--provider=` takes the key from the environment rather than a prompt.
 *
 * Two callers want this. Someone who would rather not type a provider key
 * into another project's CLI — it lands in shell history and in whatever
 * records the terminal — can export it instead. And CI cannot answer a
 * prompt at all, which is why nothing has ever exercised the configured-
 * provider path automatically.
 *
 * A missing variable stops the install instead of quietly falling through to
 * the unconfigured path: `--provider` is an explicit statement that a model
 * should be wired, so silently not wiring one would be the wrong answer to
 * a typo'd variable name in a CI job.
 */
function providerFromEnvironment(
  choice: LlmProviderChoice,
): LlmProviderPromptResult {
  const config = LLM_PROVIDERS[choice];
  const { apiKeyEnvVar, label } = config;
  const apiKey = process.env[apiKeyEnvVar]?.trim();

  if (!apiKey) {
    clack.cancel(
      `--provider=${choice} needs the ${label} key in ${apiKeyEnvVar}, and that variable is empty. Export it and run again, or drop the flag to be asked for it.`,
    );
    return { cancelled: true };
  }

  // Same rule as the key: an explicit `--provider` that cannot be configured
  // stops the install rather than scaffolding a half-wired one.
  // `.trim()` for the same reason the prompt does it: an exported variable
  // carries whatever the shell had, and whitespace is not a base URL.
  const baseUrl = config.baseUrl
    ? process.env[config.baseUrl.envVar]?.trim()
    : undefined;
  if (config.baseUrl && !baseUrl) {
    clack.cancel(
      `--provider=${choice} also needs ${config.baseUrl.envVar} — its endpoint is per-project, so a key alone cannot reach it. Export it and run again.`,
    );
    return { cancelled: true };
  }

  return {
    cancelled: false,
    choice: resolveLlmProviderChoice(choice, apiKey, baseUrl),
  };
}

async function promptLlmProvider(): Promise<LlmProviderPromptResult> {
  const choice = await clack.select({
    message: 'Which LLM provider should power chat?',
    // Ordered by how far one key gets a new install, not by vendor fame. The
    // first two configure chat *and* embeddings, so the knowledge base works
    // rather than only the chat box.
    options: [
      { value: 'openrouter' as const, label: LLM_PROVIDERS.openrouter.label },
      { value: 'scaleway' as const, label: LLM_PROVIDERS.scaleway.label },
      { value: 'openai' as const, label: LLM_PROVIDERS.openai.label },
      { value: 'anthropic' as const, label: LLM_PROVIDERS.anthropic.label },
      { value: 'skip' as const, label: 'I will configure the routes myself' },
    ],
  });

  if (clack.isCancel(choice)) {
    return { cancelled: true };
  }
  if (choice === 'skip') {
    return { cancelled: false, choice: undefined };
  }

  const config = LLM_PROVIDERS[choice as LlmProviderChoice];

  const apiKey = await clack.password({
    message: `Paste your ${config.label} API key`,
  });

  if (clack.isCancel(apiKey)) {
    return { cancelled: true };
  }
  if (!apiKey) {
    return { cancelled: false, choice: undefined };
  }

  // A provider whose endpoint is not a constant needs a second value, and
  // needs it before the install is written — Scaleway's base URL carries the
  // project id, so a key on its own scaffolds something that 404s later.
  let baseUrl: string | undefined;
  if (config.baseUrl) {
    const answer = await clack.text({ message: config.baseUrl.prompt });
    if (clack.isCancel(answer)) {
      return { cancelled: true };
    }
    // Trimmed before it is judged, not after. A pasted URL routinely carries a
    // trailing newline or space, and a string of only whitespace is truthy —
    // so `!answer` alone would accept "   " and write it as `SCW_API_BASE`,
    // which is the half-wired install this prompt exists to prevent.
    baseUrl = answer.trim();
    if (!baseUrl) {
      return { cancelled: false, choice: undefined };
    }
  }

  return {
    cancelled: false,
    choice: resolveLlmProviderChoice(
      choice as LlmProviderChoice,
      apiKey,
      baseUrl,
    ),
  };
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

/**
 * `failed` is *not* the same as "the user declined": someone running their own
 * Postgres answers no and their database is fine. Only a compose that tried and
 * could not is a reason to keep migrations away from it.
 */
async function maybeStartDocker(
  targetDir: string,
  yes: boolean,
  profiles: string[] = [],
): Promise<{ failed: boolean }> {
  const withPii = profiles.includes(PII_COMPOSE_PROFILE);

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
        'To keep them apart, answer no here and start the stack yourself under a',
        'distinct name *and* distinct host ports — the name only moves the',
        'containers and volumes, while the published ports would still collide',
        'with the running stack:',
        '',
        `  cd ${targetDir} \\`,
        '    && RAGEN_STACK_NAME=my-ragen \\',
        '       POSTGRES_PORT=55532 QDRANT_PORT=6343 QDRANT_GRPC_PORT=6344 \\',
        '       DOCLING_PORT=5011 REDIS_PORT=56479 \\',
        // Built from what this install actually chose. A command that omits
        // the profile starts a stack without the services whose urls were just
        // written — which is the same half-configuration the profile exists to
        // prevent, only printed instead of executed.
        ...(withPii
          ? [
              '       PRESIDIO_ANALYZER_PORT=5012 PRESIDIO_ANONYMIZER_PORT=5013 \\',
              `       docker compose --profile ${PII_COMPOSE_PROFILE} up -d`,
            ]
          : ['       docker compose up -d']),
        '',
        'Then update .env.local to match: DATABASE_URL, QDRANT_URL, REDIS_URL',
        withPii
          ? 'DOCLING_URL and the two PRESIDIO_* URLs all name a host port.'
          : 'and DOCLING_URL all name a host port.',
        '',
        // Not a compose port: the worker serves it itself, so two workers on
        // one machine collide on it without docker-compose having an opinion.
        'WORKER_ADMIN_PORT too, if both installs run a worker — the queue',
        'dashboard is served by the worker process, not by a container.',
      ].join('\n'),
    );
  }

  const proceed = await confirmOrSkip(
    'Start the backing services now? (Postgres, Qdrant, Redis, …)',
    yes,
  );
  if (!proceed) {
    return { failed: false };
  }

  if (!(await isDockerAvailable())) {
    clack.log.warn(
      'Docker does not seem to be available — skipping. Install Docker and run `docker compose up -d` yourself.',
    );
    return { failed: false };
  }

  const spinner = clack.spinner();
  spinner.start('Starting docker compose (Postgres, Qdrant, Redis, …)');

  try {
    await startDockerServices({ cwd: targetDir, profiles });
    spinner.stop('Backing services started.');
  } catch (error) {
    // **Not fatal, deliberately.** Every other step here aborts the install on
    // failure because it would leave a tree that fails later; this one is the
    // exception. The files are already written and correct, and the usual
    // reason compose fails is the one the warning above predicts — another
    // Ragen stack holding these container names and ports. Stopping there
    // leaves someone with a complete install, a raw `ExecaError` and no next
    // step, which is how a first run ends in a support question.
    spinner.stop('Backing services — not started.', 1);
    clack.log.warn(
      [
        'docker compose could not start the services, and the install carried',
        'on: the files are written, so this is the one step you can redo by',
        'hand. The usual cause is another Ragen stack already holding these',
        'container names and host ports — compose says so with "Conflict. The',
        'container name … is already in use".',
        '',
        'Either stop the other stack, or start this one under its own name and',
        'ports with the command printed above, then point .env.local at them.',
        '',
        `The error was: ${String(error)}`,
      ].join('\n'),
    );
    return { failed: true };
  }

  return { failed: false };
}

/**
 * `skipDatabaseSteps` is the compose failure reaching this far, and it is not
 * caution for its own sake. The usual cause of that failure is another Ragen
 * stack holding these container names — which means its Postgres is answering
 * on the very port this install was just configured for. Running `migrate
 * deploy` and the seed then writes into *that* install's database: the exact
 * thing the warning two prompts earlier exists to prevent, arrived at by a
 * different road.
 *
 * npm install and `prisma generate` still run. Both are local to the new tree,
 * neither opens a connection, and skipping them would leave something that
 * cannot be finished by hand.
 */
async function maybeRunFirstTimeSetup(
  targetDir: string,
  yes: boolean,
  env: NodeJS.ProcessEnv,
  skipDatabaseSteps = false,
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
    ...(skipDatabaseSteps
      ? []
      : ([
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
        ] as Array<[string, string, () => Promise<void>]>)),
  ];

  for (const [label, successMessage, task] of steps) {
    if (!(await runStep(spinner, label, successMessage, task))) {
      return false;
    }
  }

  if (skipDatabaseSteps) {
    clack.log.warn(
      [
        'Migrations and seeding were skipped, because the services did not',
        'start. A Postgres may well be answering on that port — the one',
        'belonging to the stack that refused to make room — and migrating into',
        'it would touch an install you did not mean to change.',
        '',
        'Once this install has services of its own:',
        '  npx prisma migrate deploy',
        '  npm run db:seed',
      ].join('\n'),
    );
  }

  return true;
}
