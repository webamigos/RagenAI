'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  createCatalogueEntryAction,
  storeCatalogueOAuthCredentialsAction,
  testCatalogueConnectionAction,
  updateCatalogueEntryAction,
  type ConnectionTestResult,
} from '../actions';
import {
  CREATABLE_AUTH_TYPES,
  valuesForAuthType,
  type CatalogueEntryInput,
} from '../validation';

const AUTH_TYPE_LABELS: Record<string, string> = {
  SERVER_SIDE:
    'Server-side — the MCP server holds the credential, users just switch it on',
  API_KEY_BEARER: 'API key — each user pastes their own key',
  EXTERNAL_MCP: 'OAuth — each user authorizes with the service',
};

const EMPTY: CatalogueEntryInput = {
  slug: '',
  label: '',
  description: '',
  mcpServerUrl: '',
  authType: 'API_KEY_BEARER',
  icon: '',
  lucideIcon: 'plug',
  systemPrompt: '',
  allowsPrivateAddress: false,
  scopes: [],
  useUserScope: false,
};

export type CatalogueEntryFormProps = {
  /** Absent when adding. Present when editing an entry an operator created. */
  entry?: CatalogueEntryInput & { publicId: string };
  onDone?: () => void;
};

export function CatalogueEntryForm({ entry, onDone }: CatalogueEntryFormProps) {
  const [values, setValues] = useState<CatalogueEntryInput>(entry ?? EMPTY);
  const [problem, setProblem] = useState<{
    field?: string;
    message: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(
    null,
  );

  const set = <K extends keyof CatalogueEntryInput>(
    key: K,
    value: CatalogueEntryInput[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const setAuthType = (authType: string) => {
    setValues((current) => valuesForAuthType(current, authType));
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(
        await testCatalogueConnectionAction(
          values.mcpServerUrl,
          values.allowsPrivateAddress,
        ),
      );
    } finally {
      setTesting(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setProblem(null);

    startTransition(async () => {
      const result = entry
        ? await updateCatalogueEntryAction(entry.publicId, values)
        : await createCatalogueEntryAction(values);

      if (result.ok) {
        toast.success(
          entry ? 'Entry updated.' : 'Entry added to the catalogue.',
        );
        if (!entry) {
          setValues(EMPTY);
        }
        onDone?.();
        return;
      }

      setProblem({
        field: result.field,
        message: result.message ?? 'That did not save.',
      });
    });
  };

  const fieldError = (field: keyof CatalogueEntryInput) =>
    problem?.field === field ? problem.message : null;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Slug"
          hint={
            entry
              ? 'A slug cannot change: vault paths and allowlists already hold it.'
              : 'Lowercase letters, digits and hyphens — for example notion.'
          }
          error={fieldError('slug')}
        >
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
            value={values.slug}
            disabled={Boolean(entry)}
            onChange={(event) => set('slug', event.target.value)}
          />
        </Field>

        <Field label="Name" error={fieldError('label')}>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={values.label}
            onChange={(event) => set('label', event.target.value)}
          />
        </Field>
      </div>

      <Field label="Description" error={fieldError('description')}>
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={values.description}
          onChange={(event) => set('description', event.target.value)}
        />
      </Field>

      <Field
        label="MCP server URL"
        hint="The endpoint this connector talks to."
        error={fieldError('mcpServerUrl')}
      >
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={values.mcpServerUrl}
          placeholder="https://mcp.example.com/mcp"
          onChange={(event) => set('mcpServerUrl', event.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Authentication" error={fieldError('authType')}>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={values.authType}
            onChange={(event) => setAuthType(event.target.value)}
          >
            {CREATABLE_AUTH_TYPES.map((authType) => (
              <option key={authType} value={authType}>
                {AUTH_TYPE_LABELS[authType] ?? authType}
              </option>
            ))}
          </select>
        </Field>

        {/* Two controls, so two labels — `Field`'s implicit association would
            name only the first of them, leaving the brand-asset box unnamed
            while appearing to be handled. */}
        <div className="space-y-1">
          <span className="block text-sm font-medium">Icon</span>
          <div className="flex gap-2">
            <label className="w-1/2">
              <span className="sr-only">Lucide icon name</span>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={values.lucideIcon}
                placeholder="plug"
                onChange={(event) => set('lucideIcon', event.target.value)}
              />
            </label>
            <label className="w-1/2">
              <span className="sr-only">Brand asset path</span>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={values.icon}
                placeholder="/assets/connectors/notion.svg"
                onChange={(event) => set('icon', event.target.value)}
              />
            </label>
          </div>
          {(fieldError('icon') ?? fieldError('lucideIcon')) ? (
            <p className="text-sm text-destructive">
              {fieldError('icon') ?? fieldError('lucideIcon')}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              A lucide icon name, or a path under public/ for a brand asset.
            </p>
          )}
        </div>
      </div>

      <Field
        label="System prompt"
        hint="Appended to the assistant's instructions when this connector is on. Optional."
      >
        <textarea
          className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={values.systemPrompt}
          onChange={(event) => set('systemPrompt', event.target.value)}
        />
      </Field>

      {values.authType === 'EXTERNAL_MCP' ? (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <Field
            label="Scopes"
            hint="One per line. Sent with the authorization request."
            error={fieldError('scopes')}
          >
            <textarea
              className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
              value={values.scopes.join('\n')}
              onChange={(event) =>
                set(
                  'scopes',
                  event.target.value
                    .split('\n')
                    .map((scope) => scope.trim())
                    .filter((scope) => scope.length > 0),
                )
              }
            />
          </Field>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={values.useUserScope}
              onChange={(event) => set('useUserScope', event.target.checked)}
            />
            <span>
              <span className="font-medium">
                Send scopes as <code>user_scope</code>
              </span>
              <span className="mt-1 block text-muted-foreground">
                Slack requires this. Nothing else here does — leave it off
                unless the service documents it.
              </span>
            </span>
          </label>

          {/* The *persisted* auth type, not the one selected a moment ago.
              This block renders as soon as EXTERNAL_MCP is chosen, so keying
              it on `entry` alone offered to store a client secret against an
              entry that is still, say, API_KEY_BEARER — and would stay that
              way if the save then failed or was abandoned. */}
          {entry?.authType === 'EXTERNAL_MCP' ? (
            <OAuthCredentials publicId={entry.publicId} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Save the entry first, then add its OAuth client id and secret —
              they go to ragen-token-vault against the saved row, never to the
              database.
            </p>
          )}
        </div>
      ) : null}

      <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={values.allowsPrivateAddress}
          onChange={(event) =>
            set('allowsPrivateAddress', event.target.checked)
          }
        />
        <span>
          <span className="font-medium">
            Allow a private address (10.x, 172.16–31.x, 192.168.x)
          </span>
          <span className="mt-1 block text-muted-foreground">
            For an MCP server on your own network. It does not allow loopback,
            link-local or reserved addresses — cloud metadata lives there, and
            nothing you self-host does. Recorded in the activity log.
          </span>
        </span>
      </label>

      {problem && !problem.field ? (
        <p className="text-sm text-destructive">{problem.message}</p>
      ) : null}

      {testResult ? (
        <div
          className={
            testResult.ok
              ? 'rounded-lg border border-border bg-muted/40 p-3 text-sm'
              : 'rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm'
          }
        >
          {testResult.ok ? (
            <>
              <p className="font-medium">
                The server answered, and it speaks MCP.
              </p>
              <p className="mt-1 text-muted-foreground">
                {testResult.toolNames.length === 0
                  ? 'It exposes no tools, which an assistant would have nothing to call.'
                  : `${testResult.toolNames.length} tools: ${testResult.toolNames.slice(0, 12).join(', ')}${testResult.toolNames.length > 12 ? '…' : ''}`}
              </p>
            </>
          ) : (
            <p className="text-destructive">{testResult.reason}</p>
          )}
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={test}
          disabled={testing || values.mcpServerUrl.trim().length === 0}
          className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-60"
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {entry ? 'Save changes' : 'Add to catalogue'}
        </button>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="rounded-md border border-border px-4 py-2 text-sm"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * The second step for an OAuth entry: its client id and secret.
 *
 * They are written to ragen-token-vault and never to the database (ADR-32),
 * which is why this is a step against a saved row rather than two more fields
 * on the create form — there is nothing to key them against until the row
 * exists.
 *
 * The form never renders them back. A secret this panel could display is a
 * secret in a screenshot; what it shows is whether one is stored.
 */
function OAuthCredentials({ publicId }: { publicId: string }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [pending, startTransition] = useTransition();

  const store = () => {
    startTransition(async () => {
      const result = await storeCatalogueOAuthCredentialsAction(
        publicId,
        clientId,
        clientSecret,
      );
      if (result.ok) {
        toast.success('Credentials stored in the vault.');
        setClientId('');
        setClientSecret('');
      } else {
        toast.error(result.message ?? 'The credentials were not stored.');
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">OAuth client credentials</div>
      <div className="flex flex-wrap gap-2">
        {/* A placeholder is not an accessible name — it is a hint that
            disappears the moment anything is typed. These two sit outside
            `Field`, so they carry their own. */}
        <label className="min-w-48 flex-1">
          <span className="sr-only">OAuth client id</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={clientId}
            placeholder="Client id"
            onChange={(event) => setClientId(event.target.value)}
          />
        </label>
        <label className="min-w-48 flex-1">
          <span className="sr-only">OAuth client secret</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={clientSecret}
            type="password"
            placeholder="Client secret"
            onChange={(event) => setClientSecret(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={store}
          disabled={pending || !clientId.trim() || !clientSecret.trim()}
          className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-60"
        >
          {pending ? 'Storing…' : 'Store in the vault'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        They go to ragen-token-vault, never to the database, and this form
        cannot read them back.
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    // A `<label>` rather than a `<div>`: the name was rendered as plain text,
    // so every control here — Name, Description, Authentication, System
    // prompt — reached assistive technology unnamed. Wrapping associates them
    // implicitly, with no id to keep unique across a form that renders twice
    // on the same page (the add form and a row's edit form).
    //
    // Implicit association names the *first* control inside, which is why the
    // Icon pair below does not use this component.
    <label className="block space-y-1">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!error && hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </label>
  );
}
