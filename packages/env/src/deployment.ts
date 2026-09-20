type Env = NodeJS.ProcessEnv;

/**
 * The strings that mean yes.
 *
 * A proper boolean parse rather than `=== '1'`, because this variable was read
 * both ways before this file existed and the strict reading is not the one to
 * standardise on. Someone who wrote `IS_ON_PREMISE=true` — the spelling most
 * people reach for — was getting on-premise behaviour from the chains, and
 * narrowing to `'1'` would take it away from them. In the worst case that
 * means an organization which had switched content moderation off, because it
 * has no provider credentials for it, starts being moderated and its chat
 * stops answering.
 */
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/**
 * Whether this installation is run by the people who use it.
 *
 * It decides exactly one thing today: whether an organization may switch
 * content moderation off. In SaaS the per-organization toggle is ignored and
 * moderation runs whenever `MODERATION_ENABLED=1`, because the traffic goes
 * through our infrastructure and our provider accounts. On-premise the
 * operator owns the deployment, the keys and the liability, so it is theirs to
 * decide.
 *
 * **This existed as two different readings of the same variable**, and they
 * disagreed exactly where it mattered:
 *
 * | value | the chains | the settings page |
 * |---|---|---|
 * | unset | SaaS | SaaS |
 * | `1` | on-premise | on-premise |
 * | `true` | **on-premise** | **SaaS** |
 * | `0` / `false` | **on-premise** | **SaaS** |
 *
 * The chains asked `!process.env.IS_ON_PREMISE`, so any non-empty string meant
 * on-premise; `rag-settings` asked `=== '1'`. So `IS_ON_PREMISE=true` gave an
 * installation where the per-organization toggle *worked* and the page told
 * the operator it did not — and `0` meant on-premise, the opposite of what
 * anybody writing `0` intends.
 *
 * The only installations whose behaviour moves are those setting `0` or
 * `false`, which today get the reverse of what they wrote.
 *
 * **Nothing in this repository sets it.** Not the compose file, not a
 * Dockerfile, not `create-ragen-app`. So every installation from the official
 * installer reads as SaaS and ignores the per-organization toggle — in the
 * deployments the distinction was invented for. That is a product question,
 * not a parsing one, and this function does not answer it; it only makes sure
 * there is one answer to read.
 */
export function isOnPremise(env: Env = process.env): boolean {
  const value = env.IS_ON_PREMISE;
  return typeof value === 'string' && TRUTHY.has(value.trim().toLowerCase());
}

/**
 * Break-glass: stop evaluating guardrails on this service, now.
 *
 * Not a feature flag, and deliberately not the inverse of one. The off switch
 * for guardrails is an empty rule set — every rule disabled in the panel,
 * which takes effect inside the 60 s loader cache. There is no
 * `GUARDRAILS_ENABLED`, because an installation that has written no rules is
 * already in the state such a variable would give it.
 *
 * What this exists for is the case the panel cannot reach in time: a judge
 * model that starts refusing everything, or a pattern rule matching every
 * message, failing faster than an operator can sign in and switch it off. Then
 * the deployment's own environment is the shorter path, and restarting with
 * `GUARDRAILS_DISABLED=1` puts the service back to the behaviour every
 * installation has today.
 *
 * It lands in B1, before any rule can block a customer's message in B3. A
 * break-glass added after the thing it protects against is a break-glass that
 * was missing exactly once.
 *
 * Parsed through the same `TRUTHY` set as `isOnPremise` and for the same
 * reason: somebody reaching for this is reaching for it during an incident,
 * and `GUARDRAILS_DISABLED=true` must not quietly mean "no".
 */
export function guardrailsDisabled(env: Env = process.env): boolean {
  const value = env.GUARDRAILS_DISABLED;
  return typeof value === 'string' && TRUTHY.has(value.trim().toLowerCase());
}
