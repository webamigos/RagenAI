import { format } from 'date-fns';

export function formatDate(date: Date | string): string {
  return format(new Date(date), 'dd/MM/yyyy');
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), 'dd/MM/yyyy HH:mm');
}
