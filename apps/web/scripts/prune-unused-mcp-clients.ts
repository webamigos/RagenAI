import db from '@ragenai/prisma-client';
import { runMcpClientMaintenance } from '@/lib/run-mcp-client-maintenance';

// Run daily from the installation's scheduler. One invocation, no in-process
// timer or worker replica race. Only counts and the cutoff are logged.
runMcpClientMaintenance()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'MCP client maintenance failed',
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
