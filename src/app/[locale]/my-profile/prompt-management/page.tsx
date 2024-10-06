import { ChatModelSelect } from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetChatTemperature } from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetApiKeys } from '@/app/components/MyProfile/SetApiKeys/SetApiKeys';

export default function PromptManagementPage() {
  return (
    <>
      <div className="flex justify-between mb-5">
        <SetChatTemperature />
        <ChatModelSelect />
      </div>
      <SetApiKeys />
    </>
  );
}
