import { KnowledgePageView } from '../../components/KnowledgePageView';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ pageId: string }> };

/**
 * One knowledge page as a curator reviews it (spec D1). The same view opens in
 * a drawer over the graph — `graph/@drawer/(..)pages/[pageId]` — when reached
 * from there; this route is what a link, a reload or any other screen gets.
 */
export default async function BrainPageDetail({ params }: Props) {
  const { pageId } = await params;
  return <KnowledgePageView pageId={pageId} variant="page" />;
}
