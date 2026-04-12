'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { createOrganizationAction } from './actions';
import { useSession } from '@/app/hooks/use-better-auth';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CreateOrganizationForm() {
  const t = useTranslations('admin.create-organization');
  const router = useRouter();
  const { refetch } = useSession();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugManuallyEdited) {
      setSlug(slugify(value));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !slug.trim()) {
      return;
    }

    startTransition(async () => {
      try {
        await createOrganizationAction(name.trim(), slug.trim());
        await refetch();
        router.push('/organization/profile');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('error'));
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label
          htmlFor="org-name"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
        >
          {t('name')}
        </label>
        <input
          id="org-name"
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          required
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        />
      </div>

      <div>
        <label
          htmlFor="org-slug"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
        >
          {t('slug')}
        </label>
        <input
          id="org-slug"
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugManuallyEdited(true);
          }}
          required
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <Button
        isSubmit={true}
        disabled={isPending || !name.trim() || !slug.trim()}
      >
        {isPending ? '...' : t('submit')}
      </Button>
    </form>
  );
}
