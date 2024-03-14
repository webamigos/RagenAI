'use client';

type Props = {
  threadId: string;
};

export const ThreadId = ({ threadId }: Props) => {
  return <p>Thread id: {threadId}</p>;
};
