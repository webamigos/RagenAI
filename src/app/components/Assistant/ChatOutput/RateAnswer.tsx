import { LikeIcon, DislikeIcon } from '@salesyy/common-ui/icons';

type Props = {
  handleRateMessage: (
    messageId: string,
    feedback: 'up' | 'down',
    runId: string
  ) => Promise<void>;
  publicId: string;
  runId?: string | null;
};

export const RateAnswer = ({ handleRateMessage, publicId, runId }: Props) => {
  return (
    <>
      <LikeIcon
        onClick={() => {
          handleRateMessage(publicId, 'up', runId!);
        }}
      />
      <DislikeIcon
        onClick={() => {
          handleRateMessage(publicId, 'down', runId!);
        }}
      />
    </>
  );
};
