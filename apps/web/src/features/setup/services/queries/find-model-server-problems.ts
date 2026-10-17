import { connectionBaseUrlVar, type ModelProbe } from '@ragenai/llm-gateway';

import type { SetupFinding } from '../../contracts/types';

/**
 * The environment variables that name a model this install uses on every turn
 * or every upload. Only these are probed: a model nobody selects cannot make
 * the install look broken.
 */
export const PROBED_MODEL_VARS = [
  'DEFAULT_MODEL',
  'REPHRASE_MODEL',
  'SUMMARY_MODEL',
  'EMBEDDINGS_MODEL',
] as const;

type Env = Record<string, string | undefined>;

/** Model id → the variables that select it, for the ids that are set. */
export function probedModels(env: Env): Map<string, string[]> {
  const models = new Map<string, string[]>();
  for (const name of PROBED_MODEL_VARS) {
    const id = env[name]?.trim();
    if (id) {
      models.set(id, [...(models.get(id) ?? []), name]);
    }
  }
  return models;
}

/**
 * Turn probe results into at most two findings: the servers that do not
 * answer, and the models a server that does answer has not got.
 *
 * Two rather than one per model because a finding's id is its translation key
 * and its list key on the page — and because "the server is down" and "the
 * model was never pulled" are fixed differently, so they are worth telling
 * apart rather than merging into "model unavailable".
 *
 * Both are `recommended`, like Docling's outage: they are runtime state, not
 * configuration, and the screen that shows them is the sign-in page — which a
 * model server being down must not keep anyone out of.
 */
export function findModelServerProblems(
  probes: readonly ModelProbe[],
  selectedBy: Map<string, string[]>,
): SetupFinding[] {
  const findings: SetupFinding[] = [];

  const unreachable = [
    ...new Set(
      probes.flatMap((probe) =>
        probe.state === 'unreachable' && probe.connection
          ? [probe.connection]
          : [],
      ),
    ),
  ];
  if (unreachable.length > 0) {
    const vars = unreachable.map(connectionBaseUrlVar);
    findings.push({
      id: 'model-server-unreachable',
      severity: 'recommended',
      vars,
      values: { connections: unreachable.join(', ') },
      example: vars.map((name) => `curl "$${name}/models"`).join('; '),
    });
  }

  const missing = probes.filter(
    (probe) => probe.state === 'missing' && probe.upstreamModel,
  );
  if (missing.length > 0) {
    const upstream = [...new Set(missing.map((probe) => probe.upstreamModel!))];
    findings.push({
      id: 'model-not-pulled',
      severity: 'recommended',
      vars: [
        ...new Set(
          missing.flatMap((probe) => selectedBy.get(probe.modelId) ?? []),
        ),
      ],
      values: { models: upstream.join(', ') },
      example: upstream.map((model) => `ollama pull ${model}`).join(' && '),
    });
  }

  return findings;
}
