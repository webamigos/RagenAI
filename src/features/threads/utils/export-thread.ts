import { Role } from '@/generated/prisma/browser';

export type ThreadExportData = {
  title: string | null;
  createdAt: Date;
  assistantName: string | null;
  messages: { role: Role; content: string; createdAt: Date }[];
  sources: { fileName: string }[];
};

export function serializeToMarkdown(data: ThreadExportData): string {
  const title = data.title ?? 'Conversation';
  const dateStr = data.createdAt.toISOString().slice(0, 10);
  const assistant = data.assistantName ?? '—';

  const header = `# ${title}\nDate: ${dateStr}\nAssistant: ${assistant}\n`;

  const messages =
    data.messages.length === 0
      ? '_No messages._'
      : data.messages
          .map((msg) => {
            let roleLabel: string;
            if (msg.role === Role.USER) {
              roleLabel = 'User';
            } else if (msg.role === Role.ASSISTANT) {
              roleLabel = 'Assistant';
            } else {
              roleLabel = msg.role;
            }
            const time = msg.createdAt.toISOString().slice(11, 16);
            return `**${roleLabel}** _${time}_\n${msg.content}`;
          })
          .join('\n\n---\n\n');

  const sources =
    data.sources.length > 0
      ? `\n\n---\n\n## Sources\n${data.sources.map((s) => `- ${s.fileName}`).join('\n')}`
      : '';

  return `${header}\n---\n\n${messages}${sources}\n`;
}

export function buildExportFilename(
  title: string | null,
  date: Date,
  ext: string,
): string {
  const raw = title ?? 'conversation';
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
    .replace(/^-|-$/g, '');
  const dateStr = date.toISOString().slice(0, 10);
  return `${slug || 'conversation'}-${dateStr}.${ext}`;
}
