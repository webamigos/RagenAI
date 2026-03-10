import { McpConnectorProvider } from '@/generated/prisma/client';
import {
  getConnectorQuery,
  type ConnectorLookupResult,
} from './get-connector-query';

export const getDriveConnectorQuery = async (
  organizationId: string,
  userId: string,
): Promise<ConnectorLookupResult> => {
  return getConnectorQuery(
    organizationId,
    userId,
    McpConnectorProvider.GOOGLE_DRIVE,
  );
};
