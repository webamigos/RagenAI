import { ChatModelSelect } from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetChatTemperature } from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetApiKeys } from '@/app/components/MyProfile/ChatInstanceSettings/SetApiKeys';
import { EditablePrompt } from '@/app/components/MyProfile/ChatInstanceSettings';
export default function PromptManagementPage() {
  return (
    <>
      <SetApiKeys />
      <div className="flex justify-between mb-5">
        <SetChatTemperature />
        <ChatModelSelect />
      </div>
      <EditablePrompt />
    </>
  );
}
