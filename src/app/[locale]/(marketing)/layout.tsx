import { getAccountSetupStatusAction } from '@/app/actions';
import { Sidebar } from '../../components/Sidebar';
import { Toast } from '../../components/Toast';
import { redirect } from 'next/navigation';
import { logger } from '@/app/lib/utils/logger';
type Props = Readonly<{
  children: React.ReactNode;
}>;

export default async function MarketingLayout({ children }: Props) {
  const status = await getAccountSetupStatusAction();
  if (!status.accountSetupComplete) {
    logger.error({ status }, 'Account misconfiguration detected');
    redirect('/account-configuration?misconfigurationDetected=true');
  }

  return (
    <>
      <Toast />
      <div className="h-screen flex flex-col">
        <Sidebar>{children}</Sidebar>
      </div>
    </>
  );
}
