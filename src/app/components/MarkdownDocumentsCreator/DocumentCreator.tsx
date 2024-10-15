'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import ReactQuill from 'react-quill-new';
import { Card } from '@salesyy/common-ui/Card';

const schema = z.object({
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

  useEffect(() => {
    register('content', { required: true, minLength: 11 });
  }, [register]);

  const onEditorStateChange = (editorState: string) => {
    setValue('content', editorState);
  };
  const editorContent = watch('content');

  const onSubmit = async (data: DocumentSchema) => {};

  return (
    <Card size="full">
      <form onSubmit={handleSubmit(onSubmit)}>
        <ReactQuill
          theme="snow"
          value={editorContent}
          onChange={onEditorStateChange}
        />
        {errors.content && <p>{errors.content.message}</p>}
        <button type="submit">Save Document</button>
      </form>
    </Card>
  );
};
