'use client';

import { useFormStatus } from 'react-dom';

export function ResolveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? 'Resolving…' : 'Mark as resolved'}
    </button>
  );
}
