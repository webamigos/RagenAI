import { BedrockEmbeddings, BedrockEmbeddingsParams } from '@langchain/aws';
import { UsageTracker } from '@/app/lib/utils/usage/usage-tracker';
import { BedrockCredentials } from '../types';

//Based on LangChain implementation:
//https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-aws/src/embeddings.ts
export class TrackedBedrockEmbeddings extends BedrockEmbeddings {
  private usageTracker?: UsageTracker;

  constructor(
    params: BedrockEmbeddingsParams,
    credentials: BedrockCredentials,
    usageTracker?: UsageTracker
  ) {
    super({
      ...params,
      region: credentials.region,
      credentials: credentials.credentials,
    });
    this.usageTracker = usageTracker;
  }

  protected async _embedText(text: string): Promise<number[]> {
    const response = await super._embedText(text);
    //Simple character tracking, we don't have usage metadata from Bedrock
    if (response && this.usageTracker) {
      this.usageTracker.incEmbeddingsTokens({
        prompt_tokens: text.length,
        total_tokens: text.length,
      });
    }
    return response;
  }
}
