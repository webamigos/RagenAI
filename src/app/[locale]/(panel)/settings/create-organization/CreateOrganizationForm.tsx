'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
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
        router.push('/settings/organization-profile');
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
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {t('name')}
        </label>
        <input
          id="org-name"
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
        />
      </div>

      <div>
        <label
          htmlFor="org-slug"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending || !name.trim() || !slug.trim()}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? '...' : t('submit')}
      </button>
    </form>
  );
}
