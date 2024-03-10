import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';

export const Assistant = () => {
  return (
    <div className="container mx-auto">
      <ChatOutput />
      <PromptForm />
    </div>
  );
};
