import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { UnauthorizedException } from '../guards/api-key.guard';
import { LimitExceededException } from '../guards/rate-limit.guard';
import { logger } from '@/app/lib/utils/logger';
import { ZodError } from 'zod';

class HttpException extends Error {}
export class NotFoundException extends HttpException {}

export class ApiErrorService {
  public static notFound() {
    throw new NotFoundException();
  }

  public static handleErrors(error: unknown) {
    logger.error({ err: error }, 'ApiErrorService');

    if (error instanceof LimitExceededException) {
      return NextResponse.json(
        { message: 'Too many requests' },
        { status: StatusCodes.TOO_MANY_REQUESTS }
      );
    }
    if (error instanceof UnauthorizedException) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: StatusCodes.UNAUTHORIZED }
      );
    }
    if (error instanceof NotFoundException) {
      return NextResponse.json(
        { message: 'Not found' },
        { status: StatusCodes.NOT_FOUND }
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { message: 'Bad request - please provide payload in body' },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        { message: 'Bad request', error: error.flatten().fieldErrors },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    return NextResponse.json(
      { message: 'Bad request' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
}
