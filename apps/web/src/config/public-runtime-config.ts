/**
 * The public configuration, read when the container starts rather than when
 * the image is built.
 *
 * `NEXT_PUBLIC_*` is a *build-time* mechanism: Next replaces the literal text
 * `process.env.NEXT_PUBLIC_FOO` with a string while compiling, in server code
 * as well as client code. That is exactly right for a value every deployment
 * shares, and wrong for every value here — the application's own URL, the
 * self-hoster's Pusher account, which domains links may point at. One
 * published image cannot carry ten installs' answers, which is why
 * `apps/web` is the one image `publish-images.yml` does not publish.
 *
 * So these values move here. The server reads the environment it is actually
 * running in, serialises the result into the document, and the browser reads
 * it back from there.
 *
 * **The bracket-free `env.NEXT_PUBLIC_*` reads below are deliberate and are
 * not inlined.** Next rewrites the exact expression `process.env.NAME`; an
 * access on a *parameter* is invisible to that transform, so this function
 * sees the real environment even for the legacy names. That is what lets a
 * deployment which sets `NEXT_PUBLIC_APP_URL` today keep working while the new
 * name takes over.
 */
export interface PublicRuntimeConfig {
  /** Where this install is reachable, for embed snippets and the auth client. */
  readonly appUrl: string;
  readonly pusherKey: string;
  readonly pusherCluster: string;
  readonly targetEnv: string;
  readonly otelCollectorUrl: string;
  readonly otelServiceName: string;
  /** Comma-separated; a link outside these is treated as untrusted. */
  readonly trustedLinkDomains: string;
  readonly hideModelSelector: string;
  readonly demoEmail: string;
  readonly demoPassword: string;
}

/**
 * The element the server writes and the browser reads.
 *
 * `type="application/json"` rather than an assignment to `window`: a JSON
 * script is data, not code, so it needs no CSP nonce and cannot execute
 * whatever ends up inside it. The values come from the deployment's own
 * environment, but a configuration mechanism that would run them if it ever
 * carried something else is a worse mechanism.
 */
export const PUBLIC_CONFIG_ELEMENT_ID = 'ragen-public-config';

const pick = (
  env: Record<string, string | undefined>,
  ...names: readonly string[]
): string => {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && value.trim() !== '') {
      return value;
    }
  }
  return '';
};

/**
 * Read the configuration from an environment. Server-side.
 *
 * Every field takes the new runtime name first and the `NEXT_PUBLIC_` one
 * second, so nothing has to be reconfigured for this to land. The fallback is
 * what gets deleted once deployments have moved, not the mechanism.
 */
export function readPublicRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): PublicRuntimeConfig {
  return {
    appUrl: pick(env, 'APP_URL', 'NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL'),
    pusherKey: pick(env, 'PUSHER_PUBLIC_KEY', 'NEXT_PUBLIC_PUSHER_KEY'),
    pusherCluster: pick(env, 'PUSHER_CLUSTER', 'NEXT_PUBLIC_PUSHER_CLUSTER'),
    targetEnv: pick(env, 'TARGET_ENV', 'NEXT_PUBLIC_TARGET_ENV'),
    otelCollectorUrl: pick(
      env,
      'OTEL_COLLECTOR_URL',
      'NEXT_PUBLIC_OTEL_COLLECTOR_URL',
    ),
    otelServiceName: pick(
      env,
      'OTEL_SERVICE_NAME',
      'NEXT_PUBLIC_OTEL_SERVICE_NAME',
    ),
    trustedLinkDomains: pick(
      env,
      'TRUSTED_LINK_DOMAINS',
      'NEXT_PUBLIC_TRUSTED_LINK_DOMAINS',
    ),
    hideModelSelector: pick(
      env,
      'HIDE_MODEL_SELECTOR',
      'NEXT_PUBLIC_HIDE_MODEL_SELECTOR',
    ),
    demoEmail: pick(env, 'DEMO_EMAIL', 'NEXT_PUBLIC_DEMO_EMAIL'),
    demoPassword: pick(env, 'DEMO_PASSWORD', 'NEXT_PUBLIC_DEMO_PASSWORD'),
  };
}

let cached: PublicRuntimeConfig | undefined;

/**
 * The configuration, wherever this runs.
 *
 * On the server it reads the process environment. In the browser it reads the
 * document the server rendered — which is why this works from a plain module
 * as well as from a component, and why the migration does not have to turn
 * `pusher-client.ts` into a hook.
 *
 * An absent element yields empty strings rather than throwing. Every consumer
 * already treats these as optional (Pusher degrades, the model selector
 * shows), and a configuration reader that throws during hydration takes the
 * page with it — a far worse failure than the one it would be reporting.
 */
export function publicRuntimeConfig(): PublicRuntimeConfig {
  if (cached) {
    return cached;
  }

  if (typeof document === 'undefined') {
    // Not cached on the server: one process serves many requests, and while
    // the environment does not change per request, caching here would hide a
    // reconfiguration behind a restart that never happened.
    return readPublicRuntimeConfig();
  }

  const element = document.getElementById(PUBLIC_CONFIG_ELEMENT_ID);
  cached = parsePublicRuntimeConfig(element?.textContent);
  return cached;
}

/** Exported for the tests, and for the script element to stay in step with it. */
export function parsePublicRuntimeConfig(
  serialised: string | null | undefined,
): PublicRuntimeConfig {
  const empty = readPublicRuntimeConfig({});

  if (!serialised) {
    return empty;
  }

  try {
    const parsed: unknown = JSON.parse(serialised);
    if (typeof parsed !== 'object' || parsed === null) {
      return empty;
    }

    /**
     * Copied field by field, and only when the value is a string.
     *
     * Spreading the parsed object would have made the type a promise this
     * function does not keep: `{"pusherKey":42}` type-checks as
     * `PublicRuntimeConfig` and reaches `new Pusher(42)`. The document is
     * written by this application's own server, so that is a lie about the
     * shape rather than an attack — but the shape is what every consumer
     * branches on, and an unknown key would ride along too.
     */
    const source = parsed as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(empty).map((key) => [
        key,
        typeof source[key] === 'string' ? source[key] : '',
      ]),
    ) as unknown as PublicRuntimeConfig;
  } catch {
    return empty;
  }
}

/** Test seam; the browser cache above would otherwise outlive a test's DOM. */
export function clearPublicRuntimeConfigCache(): void {
  cached = undefined;
}
