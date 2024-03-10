'use client';

import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';

import { Button, Input, Textarea } from '@salesyy/common-ui';
import { type PromptDto, promptSchema } from '../../../contracts/Prompt';

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
    <form onSubmit={handleSubmit(onSubmit)}>
      <Textarea
        label="Enter your question"
        placeholder="Let's chat"
        {...register('prompt')}
        rows={2}
        error={errors.prompt}
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          label="Send"
          icon={
            <PaperAirplaneIcon
              className="mt-0.5 h-5 w-5 flex-none text-white cursor-pointer"
              aria-hidden="true"
            />
          }
        />
      </div>
    </form>
  );
};
