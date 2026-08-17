import type { HttpError } from '@map-colonies/error-express-handler';

/**
 * Base class for operational errors: expected failure modes (bad input, missing
 * resource) that should be reported to the client with a specific status code,
 * as opposed to programmer errors/bugs which fall through to a generic 500.
 *
 * `statusCode` is exactly what `@map-colonies/error-express-handler`'s
 * `getErrorHandlerMiddleware` looks for on a thrown error (see the `HttpError`
 * interface it exports), so any `AppError` thrown from a controller/manager is
 * translated into the right HTTP response without any extra wiring.
 */
export class AppError extends Error implements HttpError {
  public readonly statusCode: number;

  public constructor(message: string, statusCode: number) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
