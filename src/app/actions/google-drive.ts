'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import db from '@ragenai/prisma-client';
import {
  McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';

type DriveFile = {
  id: string;
  name: string;
  mime_type: string;
  icon: string;
  modified_time: string;
  size: number | null;
  web_view_link: string;
  icon_link: string;
  owner: string;
};

type SearchResponse = {
  success: boolean;
  files?: DriveFile[];
  count?: number;
  next_page_token?: string;
  error?: string;
};

type ContentResponse = {
  success: boolean;
  file_id?: string;
  name?: string;
  mime_type?: string;
  content?: string;
  error?: string;
};

async function getDriveConnector() {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const connector = await db.mcpConnector.findUnique({
    where: {
      organization_id_user_id_provider: {
        organization_id: orgId,
        user_id: userId,
        provider: McpConnectorProvider.GOOGLE_DRIVE,
      },
    },
    select: {
      mcp_server_url: true,
      customer_id: true,
      enabled: true,
      status: true,
    },
  });

  if (
    !connector ||
    connector.status !== McpConnectorStatus.CONNECTED ||
    !connector.enabled ||
    !connector.mcp_server_url
  ) {
    return null;
  }

  // mcp_server_url has /mcp suffix (for MCP protocol), strip it for REST endpoints
  const baseUrl = connector.mcp_server_url.replace(/\/mcp$/, '');

  return { ...connector, baseUrl };
}

export async function isDriveConnected(): Promise<boolean> {
  try {
    const connector = await getDriveConnector();
    return connector !== null;
  } catch {
    return false;
  }
}

export async function searchDriveFiles(
  query: string = '',
): Promise<SearchResponse> {
  const connector = await getDriveConnector();
  if (!connector) {
    return { success: false, error: 'Google Drive not connected' };
  }

  try {
    const params = new URLSearchParams({
      customer_id: connector.customer_id,
      query,
      page_size: '20',
      mime_type: 'application/vnd.google-apps.document',
    });

    const response = await fetch(`${connector.baseUrl}/drive/search?${params}`);
    if (!response.ok) {
      logger.error(
        { status: response.status },
        'Google Drive search returned error status',
      );
      return { success: false, error: 'Failed to search Google Drive' };
    }
    const data: SearchResponse = await response.json();
    return data;
  } catch (error) {
    logger.error({ err: error }, 'Error searching Google Drive');
    return { success: false, error: 'Failed to search Google Drive' };
  }
}

export async function getDriveFileContent(
  fileId: string,
): Promise<ContentResponse> {
  const connector = await getDriveConnector();
  if (!connector) {
    return { success: false, error: 'Google Drive not connected' };
  }

  try {
    const params = new URLSearchParams({
      customer_id: connector.customer_id,
    });

    const response = await fetch(
      `${connector.baseUrl}/drive/file/${encodeURIComponent(fileId)}/content?${params}`,
    );
    if (!response.ok) {
      logger.error(
        { status: response.status, fileId },
        'Drive file content fetch returned error status',
      );
      return { success: false, error: 'Failed to fetch file content' };
    }
    const data: ContentResponse = await response.json();
    return data;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching Drive file content');
    return { success: false, error: 'Failed to fetch file content' };
  }
}
