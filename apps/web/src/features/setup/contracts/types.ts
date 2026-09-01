/**
 * A single thing the operator has to configure, and what happens if they don't.
 *
 * `required` means the app is broken without it — chat will not answer, sign-in
 * will not work. `recommended` means one feature is off but the rest of the app
 * runs, which is a perfectly reasonable state for a local install to be in.
 */
export type SetupSeverity = 'required' | 'recommended';

export type SetupFinding = {
  /**
   * Stable across renames and translations. Doubles as the i18n key: the UI
   * renders `setup.findings.<id>`, which is why no prose lives on this type —
   * one source of truth for the wording, and it is the translated one.
   */
  id: string;
  severity: SetupSeverity;
  /** The environment variables this finding is about. */
  vars: string[];
  /** Interpolation values for the translated message, when it needs any. */
  values?: Record<string, string | number>;
  /**
   * Something the operator can paste and then adjust. Literal configuration,
   * so it stays out of the translations.
   */
  example: string;
};

export type SetupReport = {
  findings: SetupFinding[];
  /** True when at least one `required` finding is present. */
  hasBlockingIssues: boolean;
};

/**
 * Whether the app can reach Postgres. Split out from the env report because a
 * `DATABASE_URL` that is present but wrong is the most common first-run
 * failure, and it is one an env check alone cannot see.
 */
export type DatabaseProbe =
  | { reachable: true }
  | { reachable: false; message: string };

export type SetupStatus = {
  report: SetupReport;
  database: DatabaseProbe;
  /**
   * Null when the database is unreachable — we genuinely do not know, and
   * saying "no admin yet" would send the operator to create one against a
   * database that is not there.
   */
  adminExists: boolean | null;
};
