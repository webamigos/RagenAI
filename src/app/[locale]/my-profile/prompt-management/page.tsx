import { ChatModelSelect } from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetChatTemperature } from '@/app/components/MyProfile/ChatInstanceSettings';

export default function PromptManagementPage() {
  return (
    <div className="flex justify-between">
      <SetChatTemperature />
      <ChatModelSelect />
    </div>
  );
}
