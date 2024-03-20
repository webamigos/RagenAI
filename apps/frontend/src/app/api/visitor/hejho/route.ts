import { NextResponse } from 'next/server';
import { clearVisitorMessages } from '../../../lib/services/visitor';

export const dynamic = 'force-dynamic';

export const POST = async (_request: Request) => {
  try {
    await clearVisitorMessages();

    return NextResponse.json({});
  } catch (error) {
    console.log('Error during clear visitor messages stats');
  }
};
