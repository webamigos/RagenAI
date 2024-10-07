import { Card } from '@salesyy/common-ui/Card';
import { SetApiKeys } from './SetApiKeys';

export const SetApiKeyWrapper = () => {
  return (
    <Card title="Set Environment Variables" size="full" className="mb-5">
      <SetApiKeys />
    </Card>
  );
};
