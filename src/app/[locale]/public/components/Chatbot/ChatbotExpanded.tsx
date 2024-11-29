type Props = {
  isMinimized: boolean;
  setIsMinimized: (isMinimized: boolean) => void;
  setIsOpen: (isOpen: boolean) => void;
  organizationId: string;
  searchParams: { title: string; message: string };
};

export const ChatbotExpanded = ({
  isMinimized,
  setIsMinimized,
  setIsOpen,
  organizationId,
  searchParams,
}: Props) => {
  return (
    <div
      className={`w-[400px] ${
        isMinimized ? 'h-[64px]' : 'h-[600px]'
      } bg-background rounded-lg shadow-xl overflow-hidden flex flex-col transition-height duration-300`}
    >
      <div className="flex justify-between items-center p-4 border-b shrink-0">
        <div>
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold">{searchParams.title}</h3>
          </div>
          {!isMinimized && (
            <span className="text-sm text-gray-500">
              {searchParams.message}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="text-gray-500 hover:text-gray-700 p-1"
          >
            <MinimizeIcon isMinimized={isMinimized} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-gray-700 p-1"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className={`flex-grow ${isMinimized ? 'hidden' : 'flex flex-col'}`}>
        <iframe
          src={`/en/public/${organizationId}?widgetMode=true`}
          className="w-full flex-grow border-0"
        />
      </div>
      <div
        className={`h-6 flex items-center justify-center text-xs text-gray-500 border-t shrink-0 ${
          isMinimized ? 'hidden' : ''
        }`}
      >
        Powered by Ragen AI
      </div>
    </div>
  );
};

const CloseIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const MinimizeIcon = ({ isMinimized }: { isMinimized: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transform: !isMinimized ? 'rotate(180deg)' : 'rotate(0deg)',
      transition: 'transform 0.3s ease',
    }}
  >
    <polyline points="18 15 12 9 6 15"></polyline>
  </svg>
);
