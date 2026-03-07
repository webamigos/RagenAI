import { LangfuseSpanProcessor, type ShouldExportSpan } from '@langfuse/otel';

const shouldExportSpan: ShouldExportSpan = ({ otelSpan }) => {
  const scopeName = otelSpan.instrumentationScope.name;
  const spanName = otelSpan.name;

  return (
    scopeName.includes('@ai-sdk') ||
    scopeName.includes('langfuse') ||
    scopeName.includes('openai') ||
    scopeName.includes('anthropic') ||
    scopeName.includes('google') ||
    spanName.includes('streamText') ||
    spanName.includes('generateText') ||
    spanName.includes('generateObject') ||
    spanName.includes('embed')
  );
};

export const langfuseSpanProcessor = new LangfuseSpanProcessor({
  shouldExportSpan,
  exportMode: 'immediate',
  environment: process.env.TARGET_ENV,
});
