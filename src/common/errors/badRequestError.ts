import httpStatus from 'http-status-codes';
import { AppError } from './appError';

export class BadRequestError extends AppError {
  public constructor(message = 'Bad request') {
    super(message, httpStatus.BAD_REQUEST);
  }
}
