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

export class BadRequestException extends Error {
  constructor(message = 'Bad request') {
    super(message);
    this.name = 'BadRequestException';
  }
}

export class InsufficientCreditsException extends Error {
  readonly required: number;
  readonly balance: number;

  constructor(required: number, balance: number) {
    super(`Insufficient credits: required ${required}, available ${balance}.`);
    this.name = 'InsufficientCreditsException';
    this.required = required;
    this.balance = balance;
  }
}
