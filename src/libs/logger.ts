/**
 * Minimal centralized logger. The point isn't the implementation (console today,
 * pino/winston tomorrow) — it's having one place that owns log formatting so
 * call sites never reach for a bare console.log.
 */
export const logger = {
  info: (message: string, meta?: unknown): void => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: 'info', message, meta, time: new Date().toISOString() }));
  },
  warn: (message: string, meta?: unknown): void => {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({ level: 'warn', message, meta, time: new Date().toISOString() }));
  },
  error: (message: string, error?: unknown): void => {
    // eslint-disable-next-line no-console
    console.error(error);
  },
};
