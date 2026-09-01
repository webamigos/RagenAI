import format from 'date-fns-tz/format';

export const formatDates = <
  T extends Record<string, Date | string | null | undefined>
>(
  dates: T,
  dateFormat: string = 'dd.MM.yyyy HH:mm:ss',
  placeholder: string = '-'
): { [K in keyof T]: string } => {
  const formattedDates: { [key: string]: string } = {};

  for (const key in dates) {
    formattedDates[key] = dates[key]
      ? format(new Date(dates[key] as string), dateFormat)
      : placeholder;
  }

  return formattedDates as { [K in keyof T]: string };
};
