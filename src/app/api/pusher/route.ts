import { pushNotification } from '@/app/lib/services/notifications';
import { NotificationEvent } from '@/app/lib/services/notifications/types';
import { NextResponse } from 'next/server';

// FIXME: only for tests
// TODO: remove
export const GET = async () => {
  pushNotification({
    event: NotificationEvent.SUCCESS_EVENT,
    message: 'hello world',
  });
  pushNotification({
    event: NotificationEvent.ERROR_EVENT,
    message: 'oh no!',
  });
  return NextResponse.json({ status: 'ok' });
};
