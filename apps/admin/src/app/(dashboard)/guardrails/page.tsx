import { listPlatformGuardrailsAction } from './actions';
import { GuardrailsPage } from './components/GuardrailsPage';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const rules = await listPlatformGuardrailsAction();

  return <GuardrailsPage rules={rules} />;
}
