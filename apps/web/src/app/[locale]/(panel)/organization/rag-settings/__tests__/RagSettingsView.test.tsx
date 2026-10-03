import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { RagSettingsView } from '../components/RagSettingsView';
import type { RagSettingsPageData } from '../actions';

const messages = {
  'organization-page': {
    'rag-settings': {
      title: 'RAG Pipeline Settings',
      description: 'View the current configuration.',
      'on-premise-note':
        'These settings can be changed in on-premise deployments.',
      'multi-query-label': 'Multi-query expansion',
      'multi-query-description': 'Generate alternative phrasings.',
      'doc-summaries-label': 'Document summaries',
      'doc-summaries-description': 'Generate summaries at ingest time.',
      'content-moderation-label': 'Content moderation',
      'content-moderation-description': 'Filter harmful content.',
      'content-moderation-saas-note': 'Always enabled in SaaS mode.',
      'reranking-label': 'Reranking',
      'reranking-description': 'Re-score retrieved documents.',
      'reranking-replaced-note':
        'Not run while section selection is on: a model chooses the passages instead.',
      'context-expansion-label': 'Context expansion',
      'context-expansion-description':
        'Read each retrieved passage with the passages around it.',
      'section-selection-label': 'Section selection',
      'section-selection-description':
        'A model picks the passages to read, in place of the reranker.',
      'models-title': 'Models in use',
      'model-embedding': 'Embedding',
      'model-reranking': 'Reranking',
      'model-rephrase': 'Rephrase / Multi-query',
      'model-answer': 'Answer generation',
      'budget-title': 'Monthly AI budget',
      'budget-no-limit': 'No limit set',
      'budget-managed-by-admin': 'Managed by platform administrator.',
    },
  },
};

function renderWithProviders(data: RagSettingsPageData) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <RagSettingsView data={data} />
    </NextIntlClientProvider>,
  );
}

const baseData: RagSettingsPageData = {
  ragSettings: {
    multiQueryEnabled: true,
    docSummariesEnabled: true,
    contentModerationEnabled: true,
    rerankingEnabled: false,
  },
  retrievalFeatures: {
    contextExpansion: true,
    sectionSelection: false,
  },
  budgetCents: 1000,
  models: {
    embedding: 'cohere-embed-multilingual-v3',
    reranking: 'cohere-rerank-v3-5',
    rephrase: 'gemini-2.5-flash',
    answer: 'gpt-5.4',
  },
  isOnPremise: false,
};

describe('RagSettingsView', () => {
  it('renders all six toggle labels', () => {
    renderWithProviders(baseData);

    expect(screen.getByText('Multi-query expansion')).toBeInTheDocument();
    expect(screen.getByText('Document summaries')).toBeInTheDocument();
    expect(screen.getByText('Content moderation')).toBeInTheDocument();
    // "Reranking" appears both as toggle label and model row label
    expect(screen.getAllByText('Reranking')).toHaveLength(2);
    expect(screen.getByText('Context expansion')).toBeInTheDocument();
    expect(screen.getByText('Section selection')).toBeInTheDocument();
  });

  it('shows context expansion and section selection as their feature keys say', () => {
    renderWithProviders(baseData);

    expect(
      screen.getByRole('switch', { name: 'Context expansion' }),
    ).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Section selection' }),
    ).not.toBeChecked();
  });

  it('says the reranker does not run while section selection replaces it', () => {
    renderWithProviders({
      ...baseData,
      ragSettings: { ...baseData.ragSettings, rerankingEnabled: true },
      retrievalFeatures: { contextExpansion: true, sectionSelection: true },
    });

    expect(
      screen.getByText(
        'Not run while section selection is on: a model chooses the passages instead.',
      ),
    ).toBeInTheDocument();
  });

  it('adds no reranker note when section selection is off', () => {
    renderWithProviders({
      ...baseData,
      ragSettings: { ...baseData.ragSettings, rerankingEnabled: true },
    });

    expect(
      screen.queryByText(/Not run while section selection is on/),
    ).not.toBeInTheDocument();
  });

  it('renders the on-premise info banner in SaaS mode', () => {
    renderWithProviders(baseData);

    expect(
      screen.getByText(
        'These settings can be changed in on-premise deployments.',
      ),
    ).toBeInTheDocument();
  });

  it('hides the on-premise info banner in on-premise mode', () => {
    renderWithProviders({ ...baseData, isOnPremise: true });

    expect(
      screen.queryByText(
        'These settings can be changed in on-premise deployments.',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows SaaS note for content moderation in SaaS mode', () => {
    renderWithProviders(baseData);

    expect(
      screen.getByText('Always enabled in SaaS mode.'),
    ).toBeInTheDocument();
  });

  it('hides SaaS note for content moderation in on-premise mode', () => {
    renderWithProviders({ ...baseData, isOnPremise: true });

    expect(
      screen.queryByText('Always enabled in SaaS mode.'),
    ).not.toBeInTheDocument();
  });

  it('renders all six switches as disabled', () => {
    renderWithProviders(baseData);

    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(6);
    for (const s of switches) {
      expect(s).toBeDisabled();
    }
  });

  it('displays model names', () => {
    renderWithProviders(baseData);

    expect(
      screen.getByText('cohere-embed-multilingual-v3'),
    ).toBeInTheDocument();
    expect(screen.getByText('cohere-rerank-v3-5')).toBeInTheDocument();
    expect(screen.getByText('gemini-2.5-flash')).toBeInTheDocument();
    expect(screen.getByText('gpt-5.4')).toBeInTheDocument();
  });

  it('displays budget in dollars', () => {
    renderWithProviders(baseData);

    expect(screen.getByText('$10.00')).toBeInTheDocument();
  });

  it('displays "No limit set" when budget is null', () => {
    renderWithProviders({ ...baseData, budgetCents: null });

    expect(screen.getByText('No limit set')).toBeInTheDocument();
  });
});
