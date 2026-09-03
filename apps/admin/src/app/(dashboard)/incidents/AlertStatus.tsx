/**
 * Whether anyone is actually being told.
 *
 * `sendSecurityAlertEmail` in apps/web already mails on a critical event, but
 * it is gated by `SECURITY_ALERT_EMAIL` being set — empty means the feature is
 * off — and by a severity threshold that defaults to `critical`. Neither is
 * visible anywhere, so an install can sit for months believing it is monitored
 * while every alert goes nowhere.
 *
 * A server component reading `process.env` directly: these values never reach
 * the browser except as the summary rendered here.
 */
export function AlertStatus({
  unresolvedCritical,
}: {
  unresolvedCritical: number;
}) {
  const recipients = (process.env.SECURITY_ALERT_EMAIL ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);

  const threshold = (process.env.SECURITY_ALERT_SEVERITY ?? 'critical')
    .trim()
    .toLowerCase();
  const knownThreshold = ['info', 'warn', 'critical'].includes(threshold);

  const configured = recipients.length > 0;

  return (
    <div
      className={`rounded-xl border p-6 ${
        configured
          ? 'border-border bg-card'
          : 'border-amber-500/30 bg-amber-500/10'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-semibold">
          {configured ? 'Alerting is on' : 'Nobody is being alerted'}
        </h2>
        {unresolvedCritical > 0 && (
          <span className="text-sm font-medium text-destructive">
            {unresolvedCritical} unresolved critical
          </span>
        )}
      </div>

      {configured ? (
        <dl className="mt-3 space-y-1 text-sm text-muted-foreground">
          <div>
            Recipients:{' '}
            <span className="font-mono text-xs text-foreground">
              {recipients.join(', ')}
            </span>
          </div>
          <div>
            Sends at{' '}
            <span className="font-mono text-xs text-foreground">
              {knownThreshold ? threshold : 'critical'}
            </span>{' '}
            and above
            {knownThreshold ? null : (
              <span className="text-destructive">
                {' '}
                — SECURITY_ALERT_SEVERITY is set to &quot;{threshold}&quot;,
                which is not a severity, so it falls back to critical
              </span>
            )}
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Set <code className="font-mono text-xs">SECURITY_ALERT_EMAIL</code> to
          a comma-separated list to receive e-mail when an event reaches the
          threshold. Events are still recorded and still appear below either way
          — nobody is notified of them.
        </p>
      )}
    </div>
  );
}
