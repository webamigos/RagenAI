import { ChatConversation } from '@ragenai/common-ui/icons';

type Props = {
  setIsOpen: (isOpen: boolean) => void;
};

export const ChatbotCollapsed = ({ setIsOpen }: Props) => {
  return (
    <div className="w-20 h-20 bg-transparent">
      <button
        onClick={() => setIsOpen(true)}
        className="w-full h-full bg-blue-500 hover:bg-blue-600 text-white rounded-full p-3 shadow-lg flex items-center justify-center"
      >
        <ChatConversation />
      </button>
    </div>
  );
};
