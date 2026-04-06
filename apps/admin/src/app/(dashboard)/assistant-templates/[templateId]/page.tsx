import { notFound } from 'next/navigation';
import { getAssistantTemplateAction } from '../actions';
import { AssistantTemplateForm } from '../components/AssistantTemplateForm';

export const dynamic = 'force-dynamic';

export default async function EditAssistantTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;

  // "new" is a special case — create mode
  if (templateId === 'new') {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Create Assistant Template</h1>
        <div className="rounded-xl border border-border bg-card p-6">
          <AssistantTemplateForm />
        </div>
      </div>
    );
  }

  const template = await getAssistantTemplateAction(templateId);

  if (!template) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <a
          href="/assistant-templates"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back
        </a>
        <h1 className="text-3xl font-bold">Edit: {template.name}</h1>
      </div>
      <div className="rounded-xl border border-border bg-card p-6">
        <AssistantTemplateForm template={template} />
      </div>
    </div>
  );
}
