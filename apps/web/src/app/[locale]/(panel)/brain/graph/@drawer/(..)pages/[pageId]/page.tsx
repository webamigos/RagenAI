import { KnowledgePageView } from '../../../../components/KnowledgePageView';
import { PageDrawer } from '../../../../components/PageDrawer';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ pageId: string }> };

/**
 * A knowledge page opened from the graph, over it rather than instead of it.
 * The same view as `pages/[pageId]`, which a reload of this URL renders.
 */
export default async function PageInDrawer({ params }: Props) {
  const { pageId } = await params;
  return (
    <PageDrawer pageId={pageId}>
      <KnowledgePageView pageId={pageId} variant="drawer" />
    </PageDrawer>
  );
}
