import { ChatModelSelect } from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetChatTemperature } from '@/app/components/MyProfile/ChatInstanceSettings';
import { EditablePrompt } from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetApiKeyWrapper } from '@/app/components/MyProfile/ChatInstanceSettings/SetApiKeyWrapper';

export const dynamic = 'force-dynamic';

export default function PromptManagementPage() {
  return (
    <div className="container flex flex-col">
      <SetApiKeyWrapper />

      <div className="flex md:justify-between mb-5 flex-col md:flex-row">
        <SetChatTemperature />
        <ChatModelSelect />
      </div>

      <EditablePrompt />
    </div>
  );
}
