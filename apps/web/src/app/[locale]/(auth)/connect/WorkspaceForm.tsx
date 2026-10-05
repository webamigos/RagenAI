'use client';
import { useState } from 'react';
import { chooseMcpWorkspace } from './actions';

type Organization = {
  id: string;
  name: string;
  assistants: { id: string; title: string }[];
};
export function WorkspaceForm({
  organizations,
  query,
}: {
  organizations: Organization[];
  query: string;
}) {
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id ?? '',
  );
  const organization = organizations.find((item) => item.id === organizationId);
  return (
    <form action={chooseMcpWorkspace.bind(null, query)} className="space-y-4">
      <label className="block">
        Organization
        <select
          name="organizationId"
          value={organizationId}
          onChange={(event) => setOrganizationId(event.target.value)}
          className="mt-1 block w-full rounded border bg-background p-2"
        >
          {organizations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Assistant
        <select
          key={organizationId}
          name="projectId"
          defaultValue=""
          className="mt-1 block w-full rounded border bg-background p-2"
        >
          <option value="">All assistants I can access</option>
          {organization?.assistants.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded bg-primary px-4 py-2 text-primary-foreground"
      >
        Continue
      </button>
    </form>
  );
}
