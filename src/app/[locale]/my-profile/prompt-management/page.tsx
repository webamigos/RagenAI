import { ChatModelSelect } from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetChatTemperature } from '@/app/components/MyProfile/ChatInstanceSettings';
import { EditablePrompt } from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetApiKeyWrapper } from '@/app/components/MyProfile/ChatInstanceSettings/SetApiKeyWrapper';

export default function PromptManagementPage() {
  return (
    <>
      <SetApiKeyWrapper />
      <div className="flex justify-between mb-5">
        <SetChatTemperature />
        <ChatModelSelect />
      </div>
      <EditablePrompt />
    </>
  );
}
