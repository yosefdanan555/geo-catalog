import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import { logger } from '../logger';

/** Shape of errors thrown by express-openapi-validator (OpenAPI schema violations). */
interface OpenApiValidationError extends Error {
  status: number;
  errors?: unknown[];
}

function isOpenApiValidationError(error: unknown): error is OpenApiValidationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

export function notFoundHandler(req: Request, res: Response): void {
  // It is also good practice to log 404s
  logger.warn(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ message: `Route ${req.method} ${req.path} was not found` });
}

// Express recognizes this as an error handler purely by its 4-argument arity, so all
// four parameters must stay even though `next` is unused.
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (isOpenApiValidationError(error)) {
    // ADDED LOGGING HERE
    logger.warn('OpenAPI Validation Error', error);
    res.status(error.status).json({ message: error.message, errors: error.errors ?? [] });
    return;
  }

  if (error instanceof AppError) {
    // ADDED LOGGING HERE
    logger.error(`AppError: ${error.message}`, error);
    res.status(error.statusCode).json({ message: error.message });
    return;
  }
  
  // This now only catches truly unhandled 500-level crashes
  logger.error('Unhandled error', error);
  res.status(500).json({ message: 'Internal server error' });
};