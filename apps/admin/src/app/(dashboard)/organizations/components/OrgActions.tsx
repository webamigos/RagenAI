'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MoreHorizontal, Pencil, Link2 } from 'lucide-react';
import { renameOrgAction, changeOrgSlugAction } from '../actions';

interface OrgActionsProps {
  orgId: string;
  orgName: string;
  orgSlug: string | null;
}

export function OrgActions({ orgId, orgName, orgSlug }: OrgActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<'rename' | 'slug' | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const openMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setMenuPos({
          top: rect.bottom + 4,
          right: window.innerWidth - rect.right,
        });
      }
      setMenuOpen(!menuOpen);
    },
    [menuOpen],
  );

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function handleClose(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClose);
    return () => document.removeEventListener('mousedown', handleClose);
  }, [menuOpen]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Organization actions"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen && (
        <div
          className="fixed z-[100] w-48 rounded-md border border-border bg-popover py-1 shadow-lg"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setDialog('rename');
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setDialog('slug');
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <Link2 className="h-3.5 w-3.5" />
            Change Slug
          </button>
        </div>
      )}

      {dialog === 'rename' && (
        <EditDialog
          title="Rename Organization"
          label="Name"
          currentValue={orgName}
          onSave={(value) => renameOrgAction(orgId, value)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'slug' && (
        <EditDialog
          title="Change Slug"
          label="Slug"
          placeholder="e.g. my-org"
          currentValue={orgSlug || ''}
          onSave={(value) => changeOrgSlugAction(orgId, value)}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function EditDialog({
  title,
  label,
  placeholder,
  currentValue,
  onSave,
  onClose,
}: {
  title: string;
  label: string;
  placeholder?: string;
  currentValue: string;
  onSave: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(currentValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSave(value);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-popover p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold">{title}</h3>
        <label className="mb-1 block text-sm text-muted-foreground">
          {label}
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
