import { supaBaseClient } from '@/app/api/threads/services/ChatService';
import { logger } from '@/app/lib/utils/logger';

export async function createTableIfNotExists(tableName: string) {
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        content TEXT,
        metadata JSONB,
        embedding vector(1536)
      );
    `;

    const { error } = await supaBaseClient.rpc('execute_sql', {
      sql_text: createTableQuery,
    });

    if (error) {
      logger.error('Error creating table:', error);
      throw error;
    }

    logger.info(`Table ${tableName} created.`);
  } catch (error) {
    logger.info(`Table ${tableName} already exists.`);
  }
}

export async function grantTablePermissions(tableName: string) {
  try {
    const grantUsageQuery = `
      GRANT USAGE ON SCHEMA public TO service_role;
    `;

    await supaBaseClient.rpc('execute_sql', {
      sql_text: grantUsageQuery,
    });

    const grantAllPrivilegesQuery = `
      GRANT ALL PRIVILEGES ON TABLE ${tableName} TO service_role;
    `;

    await supaBaseClient.rpc('execute_sql', {
      sql_text: grantAllPrivilegesQuery,
    });

    logger.info(`Permissions granted for table ${tableName}.`);
  } catch (error) {
    logger.error(`Error granting permissions for table ${tableName}:`, error);
    throw error;
  }
}
