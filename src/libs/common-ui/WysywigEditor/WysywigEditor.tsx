import dynamic from 'next/dynamic';
import { ComponentProps } from 'react';
import { FieldError } from 'react-hook-form';
import { Text } from '../Text';
import { classMerge } from '../utils/cn';
import './editor-styles.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

type Props = {
  value: string;
  onChange: (editorState: string) => void;
  label?: string;
  mandatory?: boolean;
  error?: FieldError;
  errorMessage?: string;
};

export const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ script: 'sub' }, { script: 'super' }],
    [{ header: 1 }, { header: 2 }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['blockquote', 'code-block'],
    [{ align: [] }],
    ['link', 'image'],
    ['clean'],
  ],
};

export const formats = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'blockquote',
  'list',
  'link',
  'image',
  'code-block',
  'align',
  'color',
  'background',
  'script',
  'indent',
  'direction',
];
export const WysywigEditor = ({
  value,
  label,
  error,
  errorMessage,
  className,
  mandatory = false,
  onChange,
  ...rest
}: Props & ComponentProps<typeof ReactQuill>) => {
  return (
    <div className="flex flex-col h-full">
      {label && (
        <div className="flex text-sm items-center font-medium mb-2">
          {mandatory && <Text className="text-red-600 mt-1">*</Text>}
          <label className="block leading-6 dark:text-gray-300">{label}</label>
        </div>
      )}
      <ReactQuill
        className={classMerge('custom-quill w-full flex-1', className)}
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        theme="snow"
        value={value}
        onChange={(content: string) => onChange(content)}
        modules={modules}
        formats={formats}
        {...rest}
      />
      {error && errorMessage && (
        <Text className="-mt-2" fontSize="sm" color="red-500">
          {errorMessage}
        </Text>
      )}
    </div>
  );
};
