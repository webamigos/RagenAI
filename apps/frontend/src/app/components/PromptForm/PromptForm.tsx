'use client';

import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';

import { Button, Input } from '@salesyy/common-ui';
import { type PromptDto, promptSchema } from '../../contracts/Prompt';

export const PromptForm = () => {
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<PromptDto>({
    resolver: zodResolver(promptSchema),
  });

  const onSubmit: SubmitHandler<PromptDto> = async (data) => {
    console.log('in client: ', data);
    // const serverResult = await serverAction(data);

    await axios.post('/api/prompt', data);
  };

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Input
          label="Your question"
          placeholder="Let's chat"
          {...register('prompt')}
          error={errors.prompt}
        />
        <Button type="submit" label="Send" />
      </form>
    </div>
  );
};
