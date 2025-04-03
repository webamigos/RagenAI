import { Link } from '@/i18n/routing';
import { Card } from '@ragenai/common-ui/Card';
import { useTranslations } from 'next-intl';

type Props = {
  setIsCreateModalOpen: (isOpen: boolean) => void;
};
export const OnboardingCard = ({ setIsCreateModalOpen }: Props) => {
  const t = useTranslations('sidebar');

  return (
    <div className="relative flex justify-center">
      <Card title={t('onboarding.welcome-to-ragen')} className="mx-4 mb-4">
        <div className="mt-6 space-y-4">
          <div>
            <p>{t('onboarding.welcome-message')}</p>
          </div>
          {/* <p className="font-semibold">{t('onboarding.two-ways')}</p> */}
          <div className="mt-6 space-y-4">
            <div>
              <Link href="manage-knowledge/documents-list">
                <span className="underline">{t('onboarding.add-files')}</span>
              </Link>
            </div>
            <div>
              <p>{t('onboarding.or')}</p>
            </div>
            <div>
              <p
                onClick={() => {
                  setIsCreateModalOpen(true);
                }}
                className="underline cursor-pointer"
              >
                {t('onboarding.create-new-project')}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
