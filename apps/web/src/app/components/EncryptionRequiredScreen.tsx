/**
 * Rendered by `[locale]/layout.tsx` in place of the whole app when
 * `getEncryptionStartupStatus()` (`@ragenai/crypto`) reports `'blocked'` — a
 * deployed environment with no encryption provider configured and no
 * `ALLOW_UNENCRYPTED=1` opt-out.
 *
 * Hardcoded English, no `next-intl` — same treatment as `global-error.tsx`
 * for the same reason: this is an operator-facing configuration failure, not
 * user-facing content, and it must render with as few dependencies as
 * possible (no message catalog, no providers) since those could also be
 * broken.
 */
export function EncryptionRequiredScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-lg rounded-lg border border-destructive/40 bg-crimson-50 p-6 text-destructive dark:bg-crimson-950/20">
        <h1 className="mb-2 text-lg font-semibold">
          Encryption is not configured
        </h1>
        <p className="mb-4 text-sm">
          This environment requires message and document content to be encrypted
          at rest, and no encryption provider is configured. The application
          will not serve requests until this is fixed.
        </p>
        <p className="text-sm">
          Set <code>ENCRYPTION_PROVIDER</code> (<code>scaleway</code>,{' '}
          <code>kms</code> or <code>local</code>) and its credentials. If this
          deployment has made a deliberate decision to run without encryption,
          set <code>ALLOW_UNENCRYPTED=1</code> instead — this is logged as a
          security event.
        </p>
      </div>
    </div>
  );
}
