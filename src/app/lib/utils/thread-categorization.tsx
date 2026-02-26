import { format, subDays } from 'date-fns';

export type BaseThreadType = {
  created_at: string | Date;
};

export type ThreadCategories<T extends BaseThreadType> = {
  today: T[];
  yesterday: T[];
  older: T[];
};

export const categorizeThreadsByDate = <T extends BaseThreadType>(
  threads: T[],
): ThreadCategories<T> => {
  const now = new Date();
  const todayDate = format(now, 'EEE MMM dd yyyy');
  const yesterdayDate = format(subDays(now, 1), 'EEE MMM dd yyyy');

  return threads.reduce(
    (acc, thread) => {
      const threadDate = format(new Date(thread.created_at), 'EEE MMM dd yyyy');

      if (threadDate === todayDate) {
        acc.today.push(thread);
      } else if (threadDate === yesterdayDate) {
        acc.yesterday.push(thread);
      } else {
        acc.older.push(thread);
      }

      return acc;
    },
    {
      today: [] as T[],
      yesterday: [] as T[],
      older: [] as T[],
    },
  );
};

export const getThreadCategories = <T extends BaseThreadType>(
  threads: T[],
  t: (key: string) => string,
) => {
  const { today, yesterday, older } = categorizeThreadsByDate(threads);

  return [
    { title: t('today'), threads: today },
    { title: t('yesterday'), threads: yesterday },
    { title: t('older'), threads: older },
  ];
};
