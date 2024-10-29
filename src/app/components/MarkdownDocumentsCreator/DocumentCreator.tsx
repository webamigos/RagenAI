'use client';
import './editor-styles.css';

import dynamic from 'next/dynamic';
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { useOrganization } from '@clerk/nextjs';

import { zodResolver } from '@hookform/resolvers/zod';
import { statusToast } from '@/app/lib/utils/toast';
import { useUserDocumentsContext } from '@/app/hooks/useUserDocumentsContext';
import { Card, Text, ArrowRightCircleIcon, Input } from '@salesyy/common-ui';
import { saveMarkdownWithMeta } from './action';
import { clientLogger } from '@/app/lib/utils/clientLogger';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
});

export type DocumentSchema = z.infer<typeof schema>;

export const DocumentCreator = () => {
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DocumentSchema>({
    resolver: zodResolver(schema),
  });

  const t = useTranslations('create-document');
  const { successToast, errorToast } = statusToast();
  const { organization } = useOrganization();
  const { addDocument } = useUserDocumentsContext();

  useEffect(() => {
    register('content', { required: true, minLength: 11 });
  }, [register]);

  const onEditorStateChange = (editorState: string) => {
    setValue('content', editorState);
  };
  const editorContent = watch('content');

  const onSubmit = async (data: DocumentSchema) => {
    if (!organization) {
      return;
    }

    try {
      const organizationId = organization.id.toLowerCase();
      const response = await saveMarkdownWithMeta(data, organizationId);

      if (response.success && response.document) {
        successToast({ message: 'Document created' });
        addDocument(response.document);
      } else if (response.message) {
        errorToast({ message: response.message });
      }
    } catch (error) {
      errorToast({ message: 'Error creating document' });
      clientLogger.error('Fail during creating document', error);
    }
  };

  return (
    <Card title={t('title')} size="full">
      <form onSubmit={handleSubmit(onSubmit)}>
        <Input
          mandatory={true}
          label={t('input-label')}
          type="text"
          placeholder={t('input-placeholder')}
          {...register('title')}
          className="mb-2 w-full p-2 border-gray-300"
          error={errors.title}
          errorMessage={errors.title?.message}
        />
        <div className="flex text-sm items-center font-medium mb-2">
          <Text className="text-red-600 mt-1">*</Text>
          <label className="block leading-6 dark:text-gray-300">
            {t('editor-label')}
          </label>
        </div>
        <ReactQuill
          className="custom-quill w-full"
          theme="snow"
          value={editorContent}
          onChange={onEditorStateChange}
        />
        {errors.content && (
          <Text className="mt-2" fontSize="sm" color="red-500">
            {errors.content.message}
          </Text>
        )}
        <button type="submit" className="mt-2 rounded-full cursor-pointer">
          <ArrowRightCircleIcon
            className={`fill-accent-dark-400 hover:fill-gray-100 dark:hover:fill-accent-dark-300 stroke-1`}
          />
        </button>
      </form>
    </Card>
  );
};
