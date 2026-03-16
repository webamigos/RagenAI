/**
 * HTTP provider factory for integration testing against a live Ragen instance.
 * Usage in promptfoo config:
 *   providers:
 *     - id: file://providers/http.provider.ts
 *       config:
 *         baseUrl: http://localhost:3000
 *         apiKey: your-api-key
 *         assistantId: your-assistant-id
 */
import type { ApiProvider, ProviderResponse } from 'promptfoo';

export interface HttpProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  assistantId?: string;
}

export class HttpProvider implements ApiProvider {
  private providerConfig: HttpProviderConfig;

  constructor(config?: HttpProviderConfig) {
    this.providerConfig = config ?? {};
  }

  id(): string {
    return `http:${this.providerConfig.baseUrl ?? 'http://localhost:3000'}`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const baseUrl = this.providerConfig.baseUrl ?? 'http://localhost:3000';
    const apiKey = this.providerConfig.apiKey ?? process.env.RAGEN_API_KEY;
    const assistantId = this.providerConfig.assistantId;

    if (!apiKey) {
      return { error: 'Missing API key (set config.apiKey or RAGEN_API_KEY)' };
    }

    if (!assistantId) {
      return { error: 'Missing assistantId in provider config' };
    }

    try {
      // Create a new thread
      const threadRes = await fetch(`${baseUrl}/api/v1/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ assistant_id: assistantId }),
      });

      if (!threadRes.ok) {
        return { error: `Failed to create thread: ${threadRes.status}` };
      }

      const thread = (await threadRes.json()) as { id?: string };
      if (!thread.id) {
        return { error: 'Thread creation response missing id field' };
      }

      // Send query
      const queryRes = await fetch(`${baseUrl}/api/v1/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          threadId: thread.id,
          question: prompt,
        }),
      });

      if (!queryRes.ok) {
        return { error: `Query failed: ${queryRes.status}` };
      }

      const body = await queryRes.text();
      return { output: body };
    } catch (err) {
      return { error: String(err) };
    }
  }
}

export default HttpProvider;
