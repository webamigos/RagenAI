'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MoreHorizontal, Pencil, Ban, ShieldCheck } from 'lucide-react';
import { renameUserAction, banUserAction, unbanUserAction } from '../actions';

interface UserActionsProps {
  userId: string;
  userName: string | null;
  isBanned: boolean;
}

export function UserActions({ userId, userName, isBanned }: UserActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<'rename' | 'ban' | null>(null);
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
        aria-label="User actions"
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
          {isBanned ? (
            <button
              type="button"
              onClick={async () => {
                setMenuOpen(false);
                await unbanUserAction(userId);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-green-600 transition-colors hover:bg-accent"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Unban
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setDialog('ban');
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive transition-colors hover:bg-accent"
            >
              <Ban className="h-3.5 w-3.5" />
              Ban
            </button>
          )}
        </div>
      )}

      {dialog === 'rename' && (
        <RenameDialog
          userId={userId}
          currentName={userName || ''}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'ban' && (
        <BanDialog userId={userId} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

function RenameDialog({
  userId,
  currentName,
  onClose,
}: {
  userId: string;
  currentName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await renameUserAction(userId, name);
      onClose();
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
        <h3 className="mb-4 text-lg font-semibold">Rename User</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter new name..."
          className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function BanDialog({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await banUserAction(userId, reason || undefined);
      onClose();
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
        <h3 className="mb-2 text-lg font-semibold">Ban User</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          This will prevent the user from signing in.
        </p>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ban reason (optional)..."
          className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        <div className="flex justify-end gap-2">
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
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
          >
            {loading ? 'Banning...' : 'Ban User'}
          </button>
        </div>
      </form>
    </div>
  );
}
