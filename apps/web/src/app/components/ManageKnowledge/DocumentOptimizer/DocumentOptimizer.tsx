'use client';

import React, { useState, useRef, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

import { Card } from '@ragenai/common-ui/Card';
import { Input } from '@ragenai/common-ui/Input';
import { Button } from '@ragenai/common-ui/Button';
import { uploadFiles } from '@/app/lib/services/api';
import { useUserFilesContext } from '@/app/hooks/useUserFilesContext';
import { getFileType } from '@/app/lib/utils/getFileType';
import { EmbeddingStatus, ParsingStatus } from '@/generated/prisma/browser';
import { statusToast } from '@/app/lib/utils/toast';
import { Link } from '@/i18n/routing';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { useDocumentGenerator } from './useDocumentGenerator';

const MAX_CONTENT_LENGTH = 100_000;
const WARN_CONTENT_LENGTH = 80_000;

function charCountColor(isOverLimit: boolean, isNearLimit: boolean) {
  if (isOverLimit) {
    return 'text-destructive';
  }
  if (isNearLimit) {
    return 'text-pending';
  }
  return 'text-muted-foreground';
}

export function DocumentOptimizer() {
  const t = useTranslations('document-optimizer');
  const { infoToast, errorToast } = statusToast();
  const router = useRouter();
  const { addFile } = useUserFilesContext();
  const [_, startTransition] = useTransition();

  const [title, setTitle] = useState('');
  const [inputContent, setInputContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { output, isGenerating, error, generate, reset } =
    useDocumentGenerator();

  const charCount = inputContent.length;
  const isOverLimit = charCount > MAX_CONTENT_LENGTH;
  const isNearLimit = charCount > WARN_CONTENT_LENGTH;
  const canGenerate =
    inputContent.trim().length >= 10 && !isOverLimit && !isGenerating;
  const canSave =
    output.length > 0 && !isGenerating && !isSaving && title.trim().length > 0;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setInputContent(reader.result);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerate = () => {
    if (!canGenerate) {
      return;
    }
    generate(inputContent);
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append(
        'files',
        new File([output], `${title.trim()}.md`, { type: 'text/markdown' }),
      );

      const response = await uploadFiles(formData);

      if (response.status === 200 && response.files) {
        infoToast({ message: t('save-success') });

        for (const uploaded of response.files) {
          addFile({
            id: uploaded.uniqueFileId,
            organizationId: '',
            fileName: uploaded.fileName,
            fileSize: uploaded.fileSize,
            fileType: getFileType(uploaded.fileName),
            projectId: null,
            project: null,
            document: null,
            createdAt: new Date(),
            embeddingStatus: EmbeddingStatus.NOT_STARTED,
            parsingStatus: ParsingStatus.NOT_STARTED,
          });
        }

        setTitle('');
        setInputContent('');
        reset();
        startTransition(() => {
          router.push('/knowledge/documents-list');
        });
      } else if (response.message) {
        errorToast({ message: response.message });
      }
    } catch {
      errorToast({ message: t('save-error') });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link
          href="/knowledge/documents-list"
          className="hover:text-foreground transition-colors"
        >
          {t('breadcrumb-documents')}
        </Link>
        <ChevronRightIcon className="size-4" />
        <span className="text-foreground font-medium">{t('title')}</span>
      </nav>

      <Card size="full" className="flex flex-col gap-6 p-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>

        <Input
          label={t('title-label')}
          mandatory
          type="text"
          placeholder={t('title-placeholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full"
          containerClassName="pt-0"
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          {/* Input panel */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              {t('input-label')}
            </label>
            <textarea
              className="w-full h-80 resize-none rounded-lg border border-border bg-white p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary dark:bg-muted"
              placeholder={t('input-placeholder')}
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
              disabled={isGenerating}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  outline
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating}
                >
                  {t('upload-file')}
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  isLoading={isGenerating}
                >
                  {isGenerating ? t('generating') : t('generate')}
                </Button>
              </div>
              <span
                className={`text-xs ${charCountColor(isOverLimit, isNearLimit)}`}
              >
                {charCount.toLocaleString()} /{' '}
                {MAX_CONTENT_LENGTH.toLocaleString()}
              </span>
            </div>
            {isOverLimit && (
              <p className="text-xs text-destructive">
                {t('char-limit-error')}
              </p>
            )}
            {isNearLimit && !isOverLimit && (
              <p className="text-xs text-pending">{t('char-limit-warning')}</p>
            )}
          </div>

          {/* Output panel */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              {t('output-label')}
            </label>
            <div className="h-80 overflow-auto rounded-lg border border-border bg-muted p-3 dark:bg-card">
              {output ? (
                <pre className="whitespace-pre-wrap text-sm text-foreground font-mono">
                  {output}
                  {isGenerating && (
                    <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                  )}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  {t('output-empty')}
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={!canSave}
                isLoading={isSaving}
              >
                {t('save-to-kb')}
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
      </Card>
    </div>
  );
}
