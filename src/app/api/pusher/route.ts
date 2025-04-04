import {
  errorNotification,
  infoNotification,
  successNotification,
} from '@/app/lib/services/notifications';
import { NextResponse } from 'next/server';

// FIXME: only for tests
// TODO: remove
export const GET = async () => {
  successNotification('hello world');
  infoNotification('something here');
  errorNotification('oh no!');
  return NextResponse.json({ status: 'ok' });
};
