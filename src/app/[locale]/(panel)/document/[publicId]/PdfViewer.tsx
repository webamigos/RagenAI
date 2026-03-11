'use client';

type Props = {
  filePublicId: string;
};

export function PdfViewer({ filePublicId }: Props) {
  const pdfUrl = `/api/files/${filePublicId}#navpanes=0&view=FitH`;

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
