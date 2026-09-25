'use client';

import { useState } from 'react';

import { CatalogueEntryForm } from './CatalogueEntryForm';
import { CatalogueEntryDialog } from './CatalogueRowActions';

/** "Add a connector", opening the same dialog the rows edit in. */
export function AddCatalogueEntryButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Add a connector
      </button>
      <CatalogueEntryDialog
        open={open}
        onOpenChange={setOpen}
        title="Add a connector"
        description="The server has to speak MCP over HTTP. Nothing is deployed and no release is needed — the entry is live for the organizations your allowlist permits as soon as it is saved."
      >
        <CatalogueEntryForm onDone={() => setOpen(false)} />
      </CatalogueEntryDialog>
    </>
  );
}
