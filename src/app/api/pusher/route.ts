import {
  sendErrorNotification,
  sendInfoNotification,
  sendSuccessNotification,
} from '@/app/lib/services/notifications';
import { NextResponse } from 'next/server';

// FIXME: only for tests
// TODO: remove
export const GET = async () => {
  sendSuccessNotification({ content: 'hello world', intlKey: 'success' });
  sendInfoNotification({ content: 'something here', intlKey: 'info' });
  sendErrorNotification({ content: 'oh no!', intlKey: 'error' });
  return NextResponse.json({ status: 'ok' });
};
