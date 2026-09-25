import 'server-only';

import db from '@ragenai/prisma-client';

import type { BrainScreenContext } from '../../contracts/brain-assistant.types';

/**
 * What is on the operator's screen, as the model is told it — re-read inside
 * the organization, never taken from the request. An id that answers nothing
 * here is left out, and the model is told only the view: a forged or stale id
 * produces no title, and no hint that it exists anywhere else.
 */
export async function describeScreenQuery(
  orgId: string,
  screen: BrainScreenContext,
): Promise<string> {
  switch (screen.view) {
    case 'pages':
      return `The list of knowledge pages${screen.status ? `, filtered to ${screen.status}` : ''}.`;
    case 'inbox':
      return `The findings inbox, showing ${screen.status} findings${screen.type ? ` of type ${screen.type}` : ''}. Use listFindings to read it.`;
    case 'finding': {
      const finding = await db.knowledgeFinding.findFirst({
        where: { organizationId: orgId, publicId: screen.findingId },
        select: { publicId: true, type: true, status: true },
      });
      return finding
        ? `The finding ${finding.publicId} (${finding.type}, ${finding.status}). Read it with getFinding before answering.`
        : 'The findings inbox.';
    }
    case 'page': {
      const page = await pageTitle(orgId, screen.pageId);
      return page
        ? `The knowledge page "${page.title}" (pageId ${page.publicId}, ${page.status}). Read it with getPage before answering about it.`
        : 'A knowledge page that could not be found.';
    }
    case 'graph': {
      const [focus, selected] = await Promise.all([
        screen.focusPageId ? pageTitle(orgId, screen.focusPageId) : null,
        screen.selectedPageId ? pageTitle(orgId, screen.selectedPageId) : null,
      ]);
      const parts = ['The knowledge graph'];
      if (focus) {
        parts.push(`focused on "${focus.title}" (pageId ${focus.publicId})`);
      }
      if (selected) {
        parts.push(
          `with "${selected.title}" (pageId ${selected.publicId}) selected`,
        );
      }
      return `${parts.join(', ')}.`;
    }
    case 'documents': {
      const files = screen.selectedFileIds.length
        ? await db.userFile.findMany({
            where: {
              organizationId: orgId,
              id: { in: screen.selectedFileIds },
            },
            select: { fileName: true },
            take: 20,
          })
        : [];
      return files.length
        ? `The documents Brain reads, with ${files.map((f) => `"${f.fileName}"`).join(', ')} selected.`
        : 'The documents Brain reads. Use listDocuments to read them.';
    }
  }
}

async function pageTitle(orgId: string, publicId: string) {
  return db.knowledgePage.findFirst({
    where: { organizationId: orgId, publicId },
    select: { publicId: true, title: true, status: true },
  });
}
