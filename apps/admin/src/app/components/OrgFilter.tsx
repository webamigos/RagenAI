interface OrgFilterProps {
  organizations: { id: string; name: string }[];
  currentOrgId?: string;
  baseUrl: string;
  extraParams?: Record<string, string | undefined>;
}

export function OrgFilter({
  organizations,
  currentOrgId,
  baseUrl,
  extraParams = {},
}: OrgFilterProps) {
  return (
    <form className="flex gap-2">
      {/* Preserve extra params as hidden inputs */}
      {Object.entries(extraParams).map(
        ([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />,
      )}
      <div className="relative">
        <input
          list="org-options"
          name="orgSearch"
          placeholder="Search organization..."
          defaultValue={
            currentOrgId
              ? organizations.find((o) => o.id === currentOrgId)?.name || ''
              : ''
          }
          className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          autoComplete="off"
        />
        <datalist id="org-options">
          {organizations.map((org) => (
            <option key={org.id} value={org.name} />
          ))}
        </datalist>
      </div>
      <select
        name="orgId"
        defaultValue={currentOrgId || ''}
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">All organizations</option>
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Filter
      </button>
    </form>
  );
}
