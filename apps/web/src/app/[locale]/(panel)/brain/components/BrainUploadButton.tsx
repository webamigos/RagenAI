'use client';

import { useTranslations } from 'next-intl';
import { useRef, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/routing';

/**
 * Upload straight into Brain — staged intake (spec F1). The files go through
 * the ordinary upload, named `intake=brain`: stored and parsed, never
 * indexed, listed here and in the knowledge base as out of retrieval until a
 * curated page is published or someone sends them on.
 */
export function BrainUploadButton() {
  const t = useTranslations('brain.documents');
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const upload = (files: FileList) =>
    startTransition(async () => {
      const form = new FormData();
      for (const file of Array.from(files)) {
        form.append('files', file);
      }
      form.append('intake', 'brain');
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (res.ok) {
        toast.success(t('uploaded', { count: files.length }));
        router.refresh();
      } else {
        toast.error(t('upload-failed'));
      }
      if (input.current) {
        input.current.value = '';
      }
    });

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        data-testid="brain-upload-input"
        onChange={(e) =>
          e.target.files && e.target.files.length > 0 && upload(e.target.files)
        }
      />
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => input.current?.click()}
      >
        {t('upload')}
      </Button>
    </>
  );
}
