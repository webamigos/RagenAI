const dotenvFlow = require('dotenv-flow');
const { execSync } = require('child_process');
const path = require('path');

dotenvFlow.config({
  path: path.resolve(__dirname, '../..'),
});

const directUrl = process.env.DIRECT_URL;

if (!directUrl) {
  // eslint-disable-next-line no-console
  console.error('DIRECT_URL is not defined in your environment variables');
  process.exit(1);
}

try {
  execSync(`npx supabase db push --db-url ${directUrl}`, { stdio: 'inherit' });
  // eslint-disable-next-line no-console
  console.log('Supabase migrations applied successfully');
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('Error applying migrations:', error.message);
  process.exit(1);
}
