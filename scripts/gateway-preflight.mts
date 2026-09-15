/**
 * Can this deployment actually serve what it is configured to use?
 *
 * Run it against the same environment the app will get — after changing a
 * route, adding a model, or rotating a provider's credentials:
 *
 *   npm run gateway:preflight              # routing and credentials only
 *   npm run gateway:preflight -- --probe   # ...and one real call per model
 *
 * **The `--probe` half is the one with evidence behind it.** B2c's first run
 * failed three ways that a presence check would have called healthy: Vertex had
 * `VERTEX_CREDENTIALS` set and still could not authenticate, because the
 * variable holds JSON where Google's libraries want a file path; a preview
 * model 404'd because the route could not name its region; and the route table
 * itself was unreadable from the app's working directory. "Configured" and
 * "works" are different questions, and only the second one matters.
 *
 * See docs/lessons/a-provider-package-is-not-configured-until-something-calls-it.md.
 */
import { pathToFileURL } from 'node:url';

import { embed, generateText } from 'ai';

import { UnknownModelError, gatewayFromEnv } from '@ragenai/llm-gateway';

/** A model id this deployment will ask for, and where the id comes from. */
type ConfiguredModel = {
  readonly variable: string;
  readonly id: string;
  readonly kind: 'chat' | 'embedding';
  /** Only reached on a fallback path, so a failure is less urgent. */
  readonly fallbackOnly?: boolean;
};

export function configuredModels(
  env: NodeJS.ProcessEnv,
): ConfiguredModel[] {
  const models: ConfiguredModel[] = [];

  const add = (
    variable: string,
    id: string | undefined,
    kind: ConfiguredModel['kind'],
    fallbackOnly = false,
  ) => {
    if (id?.trim()) {
      models.push({ variable, id: id.trim(), kind, fallbackOnly });
    }
  };

  add('DEFAULT_MODEL', env.DEFAULT_MODEL, 'chat');
  add('REPHRASE_MODEL', env.REPHRASE_MODEL ?? 'mistral-small-3.2', 'chat');
  add('SUMMARY_MODEL', env.SUMMARY_MODEL ?? 'gemini-2.5-flash', 'chat');
  add(
    'EMBEDDINGS_MODEL',
    env.EMBEDDINGS_MODEL ?? 'bge-multilingual-gemma2',
    'embedding',
  );
  add('MULTIMODAL_FALLBACK_MODEL', env.MULTIMODAL_FALLBACK_MODEL, 'chat', true);
  // Only reached when Docling fails or DOCUMENT_PARSER=legacy.
  add('PDF_MODEL', env.PDF_MODEL ?? 'claude-haiku-4-5', 'chat', true);

  // Named in worker source rather than by a variable, and therefore invisible
  // to a check that reads the environment — which is how all three of these
  // ended up with no route at all while this script reported a clean
  // deployment. `gpt-5.4-nano` parses SRT segments and probes whether a key is
  // live; `gpt-5.4-mini` is the `mini` tier of the PDF chain. There is no
  // variable to override them with, so they are added under the constant's
  // own home.
  add('apps/worker pdf-process-rag mini tier', 'gpt-5.4-mini', 'chat', true);
  add('apps/worker SRT segmentation', 'gpt-5.4-nano', 'chat', true);

  // De-duplicate by id, keeping the first variable that named it.
  const seen = new Set<string>();
  return models.filter((model) => {
    const key = `${model.kind}:${model.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

type Outcome = {
  readonly model: ConfiguredModel;
  readonly status: 'ok' | 'unroutable' | 'unconfigured' | 'failed';
  readonly detail?: string;
};

async function check(
  gateway: ReturnType<typeof gatewayFromEnv>,
  model: ConfiguredModel,
  probe: boolean,
): Promise<Outcome> {
  const route = gateway.routeFor(model.id);
  if (!route) {
    return {
      model,
      status: 'unroutable',
      detail: 'no entry in the route table',
    };
  }

  if (!gateway.serves(model.id)) {
    return {
      model,
      status: 'unconfigured',
      detail: `routed to ${route.provider}${route.connection ? `/${route.connection}` : ''}, which has no credentials here`,
    };
  }

  if (!probe) {
    return { model, status: 'ok', detail: `→ ${route.provider}` };
  }

  try {
    if (model.kind === 'embedding') {
      const embedding = await gateway.resolveEmbeddingModel(model.id);
      const { embedding: vector } = await embed({
        model: embedding,
        value: 'preflight',
      });
      return { model, status: 'ok', detail: `→ ${route.provider}, ${vector.length} dims` };
    }

    const chat = await gateway.resolveModel(model.id);
    const { text } = await generateText({
      model: chat,
      prompt: 'Reply with exactly: OK',
    });
    return {
      model,
      status: 'ok',
      detail: `→ ${route.provider}, answered ${JSON.stringify(text.slice(0, 20))}`,
    };
  } catch (error) {
    const message =
      error instanceof UnknownModelError
        ? error.message
        : (error as Error).message.split('\n')[0];
    return { model, status: 'failed', detail: message?.slice(0, 180) };
  }
}

async function main(): Promise<void> {
  const probe = process.argv.includes('--probe');

  // There is one path now. This printed `LLM_GATEWAY=<mode>` and offered to
  // reassure you that "the proxy path is unaffected" — B6 removed both the
  // flag and the proxy, and took `gatewayModeFromEnv` with them, so this
  // script had been failing to *load* since. See the note on the test that
  // did not catch it.
  const models = configuredModels(process.env);
  if (models.length === 0) {
    console.error('No models configured — is DEFAULT_MODEL set?');
    process.exitCode = 1;
    return;
  }

  const gateway = gatewayFromEnv();
  console.log(
    `Route table serves ${gateway.availableModels().length} model(s) with credentials present.`,
  );
  console.log(probe ? 'Probing each configured model…\n' : 'Checking routing and credentials only (pass --probe to make real calls)…\n');

  const outcomes: Outcome[] = [];
  for (const model of models) {
    outcomes.push(await check(gateway, model, probe));
  }

  for (const { model, status, detail } of outcomes) {
    const mark = status === 'ok' ? 'ok  ' : status === 'failed' ? 'FAIL' : 'MISS';
    const note = model.fallbackOnly ? ' (fallback path only)' : '';
    console.log(
      `  ${mark}  ${model.variable.padEnd(26)} ${model.id.padEnd(28)} ${detail ?? ''}${note}`,
    );
  }

  // A fallback-only model that cannot be served is reported and does not fail
  // the check. The original reason — that it was equally broken on the proxy
  // path, so it was no reason to refuse a flip — expired with the proxy. The
  // reason now is narrower and still holds: these sit on paths a deployment
  // may never reach (a PDF the primary parser could not handle, an image on a
  // text-only model), so saying so is proportionate and failing is not.
  const blocking = outcomes.filter(
    (o) => o.status !== 'ok' && !o.model.fallbackOnly,
  );
  const advisory = outcomes.filter(
    (o) => o.status !== 'ok' && o.model.fallbackOnly,
  );

  console.log();
  if (advisory.length > 0) {
    console.log(
      `${advisory.length} fallback-only model(s) cannot be served. Not blocking — these sit on paths a deployment may never reach.`,
    );
  }
  if (blocking.length > 0) {
    console.error(
      `${blocking.length} model(s) this deployment uses cannot be served.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    probe
      ? 'Every configured model answered.'
      : 'Every configured model is routed and has credentials. Re-run with --probe — presence is not usability.',
  );
}

/**
 * Only when run as a command. Importing this module — which its own test does,
 * to check the model list without making a network call — must not start a
 * preflight against whatever happens to be in the environment.
 */
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
