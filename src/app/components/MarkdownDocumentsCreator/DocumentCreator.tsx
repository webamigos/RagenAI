import parse from 'html-react-parser';
import DOMPurify from 'dompurify';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { useOrganization } from '@clerk/nextjs';

import { zodResolver } from '@hookform/resolvers/zod';
import { statusToast } from '@/app/lib/utils/toast';
import { useUserDocumentsContext } from '@/app/hooks/useUserDocumentsContext';
import {
  Card,
  ArrowRightCircleIcon,
  Input,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  WysywigEditor,
} from '@salesyy/common-ui';

import { saveMarkdownWithMeta } from './action';

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

  const t = useTranslations('create-document');
  const { successToast, errorToast } = statusToast();
  const { organization } = useOrganization();
  const { addDocument } = useUserDocumentsContext();

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
    if (!organization) return;
    try {
      const organizationId = organization.id.toLowerCase();
      const response = await saveMarkdownWithMeta(data, organizationId);

      if (response.success && response.document) {
        successToast({ message: t('created-successful') });
        addDocument(response.document);
        reset();
      } else if (response.message) {
        errorToast({ message: response.message });
      }
    } catch (error) {
      errorToast({ message: t('send-error') });
    }
  };

  return (
    <Card title={t('title')} size="full">
      <form onSubmit={handleSubmit(onSubmit)}>
        <Tabs activeTab={activeTab} setActiveTab={setActiveTab}>
          <TabList activeTab={activeTab} setActiveTab={setActiveTab}>
            <Tab>{t('edit')}</Tab>
            <Tab>{t('preview')}</Tab>
          </TabList>
          <TabPanel>
            <Input
              mandatory={true}
              label={t('input-label')}
              type="text"
              placeholder={t('input-placeholder')}
              {...register('title')}
              className="mb-2 w-full p-2 border-gray-300"
              error={touchedFields.title ? errors.title : undefined}
              errorMessage={errors.title?.message}
            />
            <WysywigEditor
              label={t('content')}
              mandatory={true}
              onChange={onEditorStateChange}
              value={editorContent || ''}
              error={touchedFields.content ? errors.content : undefined}
              errorMessage={errors.content?.message}
            />
          </TabPanel>
          <TabPanel>
            <div className="preview-content h-[25.2rem] overflow-auto border dark:border-gray-600 p-4 rounded-2xl bg-gray-50 dark:bg-accent-dark-300">
              <h2 className="text-xl font-semibold mb-4">{watch('title')}</h2>
              <div className="prose prose-lg dark:prose-invert">
                {parse(sanitizedContent)}
              </div>
            </div>
          </TabPanel>
        </Tabs>
        <button type="submit" className="rounded-full cursor-pointer">
          <ArrowRightCircleIcon className="ml-3 fill-accent-dark-400 hover:fill-gray-100 dark:hover:fill-accent-dark-300 stroke-1" />
        </button>
      </form>
    </Card>
  );
};
