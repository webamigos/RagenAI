export class NotFoundException extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundException';
  }
}

export class UnauthorizedException extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedException';
  }
}

export class LimitExceededException extends Error {
  constructor(message = 'Too many requests') {
    super(message);
    this.name = 'LimitExceededException';
  }
}
