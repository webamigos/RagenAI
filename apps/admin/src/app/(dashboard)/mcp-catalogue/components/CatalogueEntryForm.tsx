'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  createCatalogueEntryAction,
  testCatalogueConnectionAction,
  updateCatalogueEntryAction,
  type ConnectionTestResult,
} from '../actions';
import { CREATABLE_AUTH_TYPES, type CatalogueEntryInput } from '../validation';

const AUTH_TYPE_LABELS: Record<string, string> = {
  SERVER_SIDE:
    'Server-side — the MCP server holds the credential, users just switch it on',
  API_KEY_BEARER: 'API key — each user pastes their own key',
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
            onChange={(event) => set('authType', event.target.value)}
          >
            {CREATABLE_AUTH_TYPES.map((authType) => (
              <option key={authType} value={authType}>
                {AUTH_TYPE_LABELS[authType] ?? authType}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Icon"
          hint="A lucide icon name, or a path under public/ for a brand asset."
          error={fieldError('icon') ?? fieldError('lucideIcon')}
        >
          <div className="flex gap-2">
            <input
              className="w-1/2 rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={values.lucideIcon}
              placeholder="plug"
              onChange={(event) => set('lucideIcon', event.target.value)}
            />
            <input
              className="w-1/2 rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={values.icon}
              placeholder="/assets/connectors/notion.svg"
              onChange={(event) => set('icon', event.target.value)}
            />
          </div>
        </Field>
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
    <div className="space-y-1">
      <div className="text-sm font-medium">{label}</div>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!error && hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
