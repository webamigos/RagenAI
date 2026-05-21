import { type NextRequest } from 'next/server';
import { streamText, type UIMessage } from 'ai';
import { auth } from '@/lib/auth';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import { getLeadListWithLeadsQuery } from '@/features/leads/services/queries/get-lead-list-query';
import { createChatCompletionInstanceWithOrg } from '@/app/lib/services/llm';
import type { LeadColumn } from '@/features/leads/contracts/lead-column.types';
import type { LeadDto } from '@/features/leads/contracts/lead-list.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cap inline table size. ~30k chars ≈ ~7-8k tokens — leaves headroom under
// gpt-5.4-nano's 200k window. Above this, we send a sample + summary instead.
const INLINE_CHAR_BUDGET = 30_000;
const MAX_INLINE_ROWS = 1500;
const SAMPLE_ROWS_WHEN_TRUNCATED = 50;

type Params = { params: Promise<{ publicId: string }> };

function csvEscape(value: unknown): string {
  if (value == null || value === '') {
    return '';
  }
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsvTable(columns: LeadColumn[], leads: LeadDto[]): string {
  const header = ['#', ...columns.map((c) => c.label)].join(',');
  const rows = leads.map((lead) =>
    [
      lead.rowIndex + 1,
      ...columns.map((c) => csvEscape(lead.data[c.key])),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

function summarizeColumns(columns: LeadColumn[], leads: LeadDto[]): string {
  const parts: string[] = [];
  for (const col of columns) {
    const values = leads
      .map((l) => l.data[col.key])
      .filter((v) => v != null && v !== '');
    const nonEmpty = values.length;
    if (nonEmpty === 0) {
      parts.push(`- ${col.label} (${col.type}): all empty`);
      continue;
    }
    // Top 5 most common values for string columns
    if (col.type === 'string') {
      const counts = new Map<string, number>();
      for (const v of values) {
        const key = String(v);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, c]) => `${k} (${c})`)
        .join(', ');
      parts.push(
        `- ${col.label}: ${nonEmpty}/${leads.length} non-empty; top values: ${top}`,
      );
    } else {
      parts.push(
        `- ${col.label} (${col.type}): ${nonEmpty}/${leads.length} non-empty`,
      );
    }
  }
  return parts.join('\n');
}

function buildSystemPrompt({
  listName,
  rowCount,
  columns,
  leads,
  selectionInfo,
}: {
  listName: string;
  rowCount: number;
  columns: LeadColumn[];
  leads: LeadDto[];
  selectionInfo: string;
}): string {
  const intro = `You are a data-analysis assistant for a sales lead list called "${listName}". The user has ${rowCount} leads in this list. ${selectionInfo}

Each lead may have CSV columns (uploaded by the user) and enrichment columns (filled in from the Polish KRS company registry). Answer in the user's language. Be concise. When citing specific leads, use the # row number. Format numbers with thousands separators. If asked about a value that's missing or empty, say so explicitly rather than inventing.`;

  // Try inline table first.
  const csv = buildCsvTable(columns, leads);
  if (leads.length <= MAX_INLINE_ROWS && csv.length <= INLINE_CHAR_BUDGET) {
    return `${intro}

Here is the full table (CSV):

\`\`\`csv
${csv}
\`\`\``;
  }

  // Truncated: send a sample + per-column summary.
  const sample = leads.slice(0, SAMPLE_ROWS_WHEN_TRUNCATED);
  const sampleCsv = buildCsvTable(columns, sample);
  const summary = summarizeColumns(columns, leads);
  return `${intro}

The full list is too large to send inline (${leads.length} rows). Below is a sample of the first ${sample.length} rows followed by per-column summary statistics across all rows. If the user asks a question that requires inspecting every row, answer based on the summary, and tell them you can only see a sample of individual rows.

Sample (first ${sample.length} rows):
\`\`\`csv
${sampleCsv}
\`\`\`

Per-column summary across all ${leads.length} rows:
${summary}`;
}

function extractText(message: UIMessage): string {
  if (!message.parts) {
    return '';
  }
  let text = '';
  for (const part of message.parts) {
    if (part.type === 'text') {
      text += part.text;
    }
  }
  return text;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return new Response('Unauthorized', { status: 401 });
    }
    const orgId = await getOrgIdFromAuth();
    if (!orgId) {
      return new Response('Organization not found', { status: 400 });
    }

    const { publicId } = await params;
    const body = await request.json();
    const messages: UIMessage[] = body.messages ?? [];
    const selectedIds: string[] = Array.isArray(body.selectedIds)
      ? body.selectedIds
      : [];

    if (messages.length === 0) {
      return new Response('No messages', { status: 400 });
    }

    const list = await getLeadListWithLeadsQuery(publicId, orgId);
    if (!list) {
      return new Response('Lead list not found', { status: 404 });
    }

    let scopedLeads = list.leads;
    let selectionInfo = '';
    if (selectedIds.length > 0) {
      const selectedSet = new Set(selectedIds);
      scopedLeads = list.leads.filter((l) => selectedSet.has(l.publicId));
      selectionInfo = `The user has selected ${scopedLeads.length} of the ${list.leads.length} leads in this list; scope all answers to the selected rows unless the user explicitly asks about the whole list.`;
    } else {
      selectionInfo = `The user has not selected any specific rows; answer about the whole list.`;
    }

    const systemPrompt = buildSystemPrompt({
      listName: list.name,
      rowCount: scopedLeads.length,
      columns: list.columns,
      leads: scopedLeads,
      selectionInfo,
    });

    // Convert UIMessage[] to plain content for streamText.
    const modelMessages = messages.map((m) => ({
      role: m.role,
      content: extractText(m),
    }));

    const model = await createChatCompletionInstanceWithOrg({}, orgId);

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      temperature: 0.2,
    });

    // DefaultChatTransport on the client expects the UI Message Stream
    // protocol (typed message parts); toTextStreamResponse would return
    // plain text which the transport doesn't parse.
    return result.toUIMessageStreamResponse();
  } catch (error) {
    logger.error({ err: error }, 'leads chat route failed');
    return new Response('Internal Server Error', { status: 500 });
  }
}
