import { type AppLogger } from './interface';
import { logger as clientLogger } from './clientLogger';

// For better DX — a caller does not have to think about which logger belongs
// on the server and which in the browser.
//
// `require` here is the *bundler's*, not Node's: webpack and Turbopack provide
// one inside an ESM module, which is the only reason this file has ever
// worked. apps/web is `"type": "module"`, so in plain Node — every `tsx`
// script under `src/scripts/`, and anything else run outside the bundler —
// there is no `require` at all, and reaching for it throws a `ReferenceError`
// before a single line of the script runs.
//
// That failure used to be invisible twice over: the server branch's throw was
// swallowed by a `catch` that read it as "serverLogger is unavailable", and
// the fallback then threw the same way. Guarding on `require` itself makes the
// condition explicit, and hands plain Node the client logger — which is
// isomorphic pino, already this file's documented fallback, and perfectly good
// for a script.
const bundlerRequire = typeof require === 'function' ? require : undefined;

let logger: AppLogger = clientLogger;

if (typeof window === 'undefined' && bundlerRequire) {
  try {
    logger = (bundlerRequire('./serverLogger') as { logger: AppLogger }).logger;
  } catch (error) {
    // Distinct from the no-bundler case above, and genuinely unexpected: the
    // module exists and failed to load. Say so rather than degrading in
    // silence — the server would otherwise log through the browser logger,
    // with no pretty-printing and no OTel wiring, and nothing to explain it.
    // console, not `logger`: this is the code that decides what `logger` is,
    // and the one it wanted just failed to load.
    // eslint-disable-next-line no-console
    console.warn(
      '[logger] serverLogger failed to load, falling back to clientLogger',
      error,
    );
  }
}

export { logger };
