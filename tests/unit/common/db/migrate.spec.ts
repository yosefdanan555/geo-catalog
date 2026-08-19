import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `migrate.ts` is a CLI script: it runs `run()` at import time and never exports
 * anything, so each scenario needs a fresh module (`vi.resetModules()`) with `knex`
 * and `createConnection` mocked before importing it, then a couple of microtask
 * flushes to let its internal `await`s settle before asserting.
 */

const ORIGINAL_ARGV = process.argv;

afterEach(() => {
  process.argv = ORIGINAL_ARGV;
  process.exitCode = undefined;
  vi.doUnmock('knex');
  vi.doUnmock('@common/db/createConnection');
  vi.restoreAllMocks();
  vi.resetModules();
});

interface KnexMocks {
  latest: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function mockKnex(overrides: Partial<Pick<KnexMocks, 'latest' | 'rollback'>> = {}): KnexMocks {
  const destroy = vi.fn().mockResolvedValue(undefined);
  const latest = overrides.latest ?? vi.fn().mockResolvedValue([1, ['20260813120000_create_products_table.js']]);
  const rollback = overrides.rollback ?? vi.fn().mockResolvedValue([1, ['20260813120000_create_products_table.js']]);

  vi.doMock('knex', () => ({ default: vi.fn().mockReturnValue({ migrate: { latest, rollback }, destroy }) }));
  vi.doMock('@common/db/createConnection', () => ({ createConnectionOptions: () => ({}) }));

  return { latest, rollback, destroy };
}

/** Lets the script's internal chain of `await`s (migrate call -> log -> finally -> destroy) settle. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('migrate script', () => {
  it('defaults to "latest", runs the migration and logs the result', async () => {
    process.argv = ['node', 'migrate.ts'];
    const { latest, destroy } = mockKnex();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await import('@common/db/migrate.js');
    await flushMicrotasks();

    expect(latest).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('Ran migrations', ['20260813120000_create_products_table.js']);
  });

  it('rolls back when given "rollback" and logs the result', async () => {
    process.argv = ['node', 'migrate.ts', 'rollback'];
    const { rollback, destroy } = mockKnex();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await import('@common/db/migrate.js');
    await flushMicrotasks();

    expect(rollback).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('Rolled back migrations', ['20260813120000_create_products_table.js']);
  });

  it('reports failure and sets a non-zero exit code for an unrecognized direction, but still destroys the connection', async () => {
    process.argv = ['node', 'migrate.ts', 'sideways'];
    const { destroy } = mockKnex();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await import('@common/db/migrate.js');
    await flushMicrotasks();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [, error] = errorSpy.mock.calls[0] as [string, Error];
    expect(errorSpy).toHaveBeenCalledWith('Migration failed', expect.any(Error));
    expect(error.message).toContain('Unknown migrate direction "sideways", expected "latest" or "rollback"');
    expect(process.exitCode).toBe(1);
  });

  it('still destroys the connection and reports failure when the migration itself rejects', async () => {
    process.argv = ['node', 'migrate.ts', 'latest'];
    const migrationError = new Error('connection refused');
    const { destroy } = mockKnex({ latest: vi.fn().mockRejectedValue(migrationError) });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await import('@common/db/migrate.js');
    await flushMicrotasks();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Migration failed', migrationError);
    expect(process.exitCode).toBe(1);
  });
});
