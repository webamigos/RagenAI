import {
  getConnectorQuery,
  type ConnectorLookupResult,
} from './get-connector-query';

/**
 * The catalogue slug, which for a built-in is the old enum member verbatim —
 * vault token paths and `customerId`s already hold that string.
 */
const GOOGLE_DRIVE_SLUG = 'GOOGLE_DRIVE';

export const getDriveConnectorQuery = async (
  organizationId: string,
  userId: string,
): Promise<ConnectorLookupResult> => {
  return getConnectorQuery(organizationId, userId, GOOGLE_DRIVE_SLUG);
};
