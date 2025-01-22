import { ChatConversation } from '@ragenai/common-ui/icons';

type Props = {
  setIsOpen: (isOpen: boolean) => void;
};

export const ChatbotCollapsed = ({ setIsOpen }: Props) => {
  return (
    <div className="w-20 h-20 bg-transparent overflow-hidden origin-center">
      <button
        onClick={() => setIsOpen(true)}
        className="w-full h-full bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center transition-transform duration-200 hover:scale-105"
      >
        <ChatConversation />
      </button>
    </div>
  );
};
