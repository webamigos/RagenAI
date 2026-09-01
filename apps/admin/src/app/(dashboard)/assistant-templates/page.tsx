import Link from 'next/link';
import { getAssistantTemplatesAction } from './actions';
import { AssistantTemplatesList } from './components/AssistantTemplatesList';

export const dynamic = 'force-dynamic';

export default async function AssistantTemplatesPage() {
  const templates = await getAssistantTemplatesAction();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Global Assistants</h1>
        <Link
          href="/assistant-templates/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create template
        </Link>
      </div>

      <AssistantTemplatesList templates={templates} />
    </div>
  );
}
