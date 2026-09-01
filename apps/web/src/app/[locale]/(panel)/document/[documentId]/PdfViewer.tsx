'use client';

type Props = {
  fileId: string;
};

export function PdfViewer({ fileId }: Props) {
  const pdfUrl = `/api/files/${fileId}#navpanes=0&view=FitH`;

  return (
    <div className="h-full overflow-hidden">
      <iframe
        src={pdfUrl}
        className="h-full w-full border-0"
        title="PDF Preview"
      />
    </div>
  );
}
