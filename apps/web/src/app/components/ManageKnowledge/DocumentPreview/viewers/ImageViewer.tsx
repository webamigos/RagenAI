'use client';

type Props = {
  contentUrl: string;
  fileName: string;
};

export function ImageViewer({ contentUrl, fileName }: Props) {
  return (
    <div className="flex h-full items-center justify-center overflow-hidden bg-muted dark:bg-card p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={contentUrl}
        alt={fileName}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}
