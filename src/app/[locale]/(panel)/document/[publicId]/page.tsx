import { DocumentComponent } from './DocumentComponent';

type DocumentPageProps = {
  params: Promise<{
    locale: string;
    publicId: string;
  }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { publicId } = await params;

  return <DocumentComponent publicId={publicId} />;
}
