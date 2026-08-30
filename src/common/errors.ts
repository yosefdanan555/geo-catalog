import type { HttpError } from '@map-colonies/error-express-handler';
import httpStatus from 'http-status-codes';

export abstract class AppError extends Error implements HttpError {
  public readonly statusCode: number;

  protected constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  public constructor(message = 'Resource not found') {
    super(message, httpStatus.NOT_FOUND);
  }
}

export class BadRequestError extends AppError {
  public constructor(message = 'Bad request') {
    super(message, httpStatus.BAD_REQUEST);
  }
}
