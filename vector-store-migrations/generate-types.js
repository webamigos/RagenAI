const dotenvFlow = require('dotenv-flow');
const { execSync } = require('child_process');
const path = require('path');

dotenvFlow.config({
  path: path.resolve(__dirname, '..'),
});

const projectId = process.env.SUPABASE_PROJECT_ID;

if (!projectId) {
  // eslint-disable-next-line no-console
  console.error(
    'SUPABASE_PROJECT_ID is not defined in your environment variables'
  );
  process.exit(1);
}

try {
  execSync(
    `npx supabase gen types --lang=typescript --project-id ${projectId} > ./src/libs/db/vectorStoreDatabase.types.ts`,
    { stdio: 'inherit' }
  );
  // eslint-disable-next-line no-console
  console.log('Supabase types generated successfully');
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('Error generating Supabase types:', error.message);
  process.exit(1);
}
