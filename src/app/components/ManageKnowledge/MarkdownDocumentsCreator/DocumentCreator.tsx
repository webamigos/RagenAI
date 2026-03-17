'use client';

import parse from 'html-react-parser';
import DOMPurify from 'dompurify';
import React, { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import TurndownService from 'turndown';
import { useRouter } from '@/i18n/routing';

import { zodResolver } from '@hookform/resolvers/zod';
import { statusToast } from '@/app/lib/utils/toast';
import { Card } from '@ragenai/common-ui/Card';
import { Input } from '@ragenai/common-ui/Input';
import { Tabs, TabList, Tab, TabPanel } from '@ragenai/common-ui/Tabs';
import { WysiwygEditor } from '@ragenai/common-ui/WysywigEditor';
import { Button } from '@ragenai/common-ui/Button';
import { uploadFiles } from '@/app/lib/services/api';
import { useUserFilesContext } from '@/app/hooks/useUserFilesContext';
import { getFileType } from '@/app/lib/utils/getFileType';
import { EmbeddingStatus, ParsingStatus } from '@/generated/prisma/browser';

const turndownService = new TurndownService();
import { logger } from '@/app/lib/utils/logger';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
});

const initialValues = {
  title: '',
  content: '',
};

export type DocumentSchema = z.infer<typeof schema>;

export const DocumentCreator = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [_, startTransition] = useTransition();

  const t = useTranslations('create-document');
  const { infoToast, errorToast } = statusToast();
  const router = useRouter();
  const { addFile } = useUserFilesContext();

  const {
    handleSubmit,
    register,
    setValue,
    watch,
    reset,
    formState: { errors, touchedFields },
  } = useForm<DocumentSchema>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
  });

  const editorContent = watch('content');
  const sanitizedContent = DOMPurify.sanitize(editorContent || '');

  const onEditorStateChange = (editorState: string) => {
    setValue('content', editorState, {
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  const onSubmit = async (data: DocumentSchema) => {
    setIsLoading(true);

    try {
      const markdownContent = turndownService.turndown(editorContent);

      const formData = new FormData();
      formData.append(
        'files',
        new File([markdownContent], `${data.title}.md`, {
          type: 'text/markdown',
        }),
      );

      const response = await uploadFiles(formData);

      if (response.status === 200 && response.files) {
        infoToast({ message: t('created-successful') });

        for (const uploaded of response.files) {
          addFile({
            publicId: uploaded.uniqueFileId,
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

        reset();
        startTransition(() => {
          router.push('/knowledge/documents-list');
        });
      } else if (response.message) {
        errorToast({ message: response.message });
      }
    } catch (error) {
      logger.error('Error creating document: %o', error);
      errorToast({ message: t('send-error') });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card size="full" className="flex flex-col">
      <form onSubmit={handleSubmit(onSubmit)} className="h-full flex flex-col">
        <Tabs activeTab={activeTab} setActiveTab={setActiveTab}>
          <TabList activeTab={activeTab} setActiveTab={setActiveTab}>
            <Tab>{t('edit')}</Tab>
            <Tab>{t('preview')}</Tab>
          </TabList>
          <TabPanel className="h-full !px-0 !pt-3 !pb-0">
            <Input
              mandatory={true}
              label={t('input-label')}
              type="text"
              placeholder={t('input-placeholder')}
              {...register('title')}
              className="w-full"
              containerClassName="pt-0 mb-2"
              error={touchedFields.title ? errors.title : undefined}
              errorMessage={errors.title?.message}
            />
            <div className="flex-1 flex flex-col">
              <WysiwygEditor
                label={t('content')}
                mandatory={true}
                onChange={onEditorStateChange}
                value={editorContent || ''}
                error={touchedFields.content ? errors.content : undefined}
                errorMessage={errors.content?.message}
                className="flex-1 max-h-[22rem] overflow-auto"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                className="w-full md:w-auto"
                isSubmit
                isLoading={isLoading}
              >
                {t('send')}
              </Button>
            </div>
          </TabPanel>
          <TabPanel className="h-full flex-1 !px-0 !pt-3 !pb-0">
            <div className="flex-1 preview-content h-[25.2rem] overflow-auto border dark:border-gray-600 p-4 rounded-lg bg-gray-50 dark:bg-accent-dark-300">
              <h2 className="text-xl font-semibold mb-4">{watch('title')}</h2>
              <div className="h-full flex-1 prose prose-lg dark:prose-invert">
                {parse(sanitizedContent)}
              </div>
            </div>
          </TabPanel>
        </Tabs>
      </form>
    </Card>
  );
};
