import httpStatus from 'http-status-codes';
import { AppError } from './appError';

export class NotFoundError extends AppError {
  public constructor(message = 'Resource not found') {
    super(message, httpStatus.NOT_FOUND);
  }
}
