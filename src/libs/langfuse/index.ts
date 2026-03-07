import { LangfuseSpanProcessor, type ShouldExportSpan } from '@langfuse/otel';

const shouldExportSpan: ShouldExportSpan = ({ otelSpan }) => {
  const scopeName = otelSpan.instrumentationScope.name;
  const spanName = otelSpan.name;

  return (
    scopeName === 'ai' ||
    scopeName.includes('langfuse') ||
    scopeName.includes('openai') ||
    scopeName.includes('anthropic') ||
    scopeName.includes('google') ||
    spanName.startsWith('ai.')
  );
};

export const langfuseSpanProcessor = new LangfuseSpanProcessor({
  shouldExportSpan,
  exportMode: 'immediate',
  environment: process.env.TARGET_ENV,
});
