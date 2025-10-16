import { ChatbotWidget } from '../../../components/Chatbot/ChatbotWidget';

export default async function WidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ title: string; message: string }>;
}) {
  const { organizationId } = await params;
  const _searchParams = await searchParams;
  return (
    <div className="w-full h-full">
      <ChatbotWidget
        organizationId={organizationId}
        searchParams={_searchParams}
      />
    </div>
  );
}
