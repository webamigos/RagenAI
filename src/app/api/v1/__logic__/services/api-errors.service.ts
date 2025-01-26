import { NextResponse } from 'next/server';
import { UnauthorizedException } from '../guards/api-key.guard';
import { LimitExceededException } from '../guards/rate-limit.guard';

export class ApiErrorService {
  public static handleErrors(err: unknown) {
    if (err instanceof LimitExceededException) {
      return NextResponse.json(
        { message: 'Too many requests' },
        { status: 429 }
      );
    }
    if (err instanceof UnauthorizedException) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
}
