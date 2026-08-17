/**
 * Base class for operational errors: expected failure modes (bad input, missing
 * resource) that should be reported to the client with a specific status code,
 * as opposed to programmer errors/bugs which fall through to a generic 500.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational = true;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
