import { NextRequest } from 'next/server';
import { logger } from '@/app/lib/utils/logger';
import { auth } from '@/lib/auth';
import { ChatType } from '@/features/messages/contracts/message.types';
import { streamEvents } from '@/app/api/threads/services/assistant-stream';
import { AssistantMode } from '@/features/assistants/contracts/assistant.types';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ threadId: string }>;
};

/**
 * Chat API route compatible with TextStreamChatTransport from AI SDK v6.
 * Accepts { messages } with UIMessage format (parts-based),
 * extracts the last user message text, runs the chain, and returns plain text stream.
 */
export async function POST(request: NextRequest, { params }: Params) {
  let sseStream: ReadableStream | undefined;

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const orgId = await getOrgIdFromAuth();
    if (!orgId) {
      return new Response('Organization not found', { status: 400 });
    }

    const { threadId } = await params;
    const body = await request.json();

    // AI SDK v6 sends { messages: UIMessage[] } where UIMessage has `parts` array
    const messages = body.messages || [];
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.role !== 'user') {
      return new Response('No user message found', { status: 400 });
    }

    // Extract text from UIMessage parts (v6 format)
    let userText = '';
    if (lastMessage.parts) {
      for (const part of lastMessage.parts) {
        if (part.type === 'text') {
          userText += part.text;
        }
      }
    } else if (lastMessage.content) {
      // Fallback for legacy format
      userText = lastMessage.content;
    }

    if (!userText.trim()) {
      return new Response('Empty message', { status: 400 });
    }

    // Use the existing stream events logic
    sseStream = await streamEvents({
      publicThreadId: threadId,
      userMessage: {
        prompt: userText,
        messageType: 'TEXT',
      },
      orgId,
      mode: AssistantMode.INTERNAL,
      filteredMode: ChatType.RAG,
    });

    // Transform the custom SSE stream into a plain text stream.
    // The SSE format is: "event: {name}\ndata: {json}\n\n"
    // We only forward the content from "delta" events.
    let buffer = '';
    const textStream = sseStream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          buffer += new TextDecoder().decode(chunk);

          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            let event: string | undefined;
            let data: string | undefined;

            for (const line of trimmed.split('\n')) {
              if (line.startsWith('event: ')) {
                event = line.slice(7);
              } else if (line.startsWith('data: ')) {
                data = line.slice(6);
              }
            }

            if (event === 'delta' && data) {
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  controller.enqueue(new TextEncoder().encode(parsed.content));
                }
              } catch {
                // Skip unparseable data
              }
            }
          }
        },
        flush(controller) {
          if (buffer.trim()) {
            const trimmed = buffer.trim();
            let event: string | undefined;
            let data: string | undefined;

            for (const line of trimmed.split('\n')) {
              if (line.startsWith('event: ')) {
                event = line.slice(7);
              } else if (line.startsWith('data: ')) {
                data = line.slice(6);
              }
            }

            if (event === 'delta' && data) {
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  controller.enqueue(new TextEncoder().encode(parsed.content));
                }
              } catch {
                // Skip
              }
            }
          }
        },
      })
    );

    return new Response(textStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in chat API route');
    if (sseStream) {
      sseStream.cancel();
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}
