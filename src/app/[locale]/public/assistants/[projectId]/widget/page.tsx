import { ChatbotWidget } from '../../../components/Chatbot/ChatbotWidget';

export default function WidgetPage({
  params,
  searchParams,
}: {
  params: { organizationId: string };
  searchParams: { title: string; message: string };
}) {
  return (
    <div className="w-full h-full">
      <ChatbotWidget
        organizationId={params.organizationId}
        searchParams={searchParams}
      />
    </div>
  );
}
