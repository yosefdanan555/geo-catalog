import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `dbConfig.ts` reads and validates its config synchronously at import time (there's
 * no exported function to call per-scenario), so every scenario here needs its own
 * fresh module instance: mock `node:fs` for that one import, then `vi.resetModules()`
 * before the next test picks a different fake filesystem.
 */

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
  vi.doUnmock('node:fs');
  vi.resetModules();
});

/**
 * `files` maps a bare filename (e.g. "default.json") to the parsed JSON it should contain.
 * `dbConfig.ts` only ever calls `existsSync`/`readFileSync` off its default `fs` import, so
 * the fake only needs to cover those two — no need to preserve the rest of the real module.
 */
function mockConfigFiles(files: Record<string, unknown>): void {
  const existsSync = (filePath: string): boolean => Object.keys(files).some((name) => filePath.endsWith(name));
  const readFileSync = (filePath: string): string => {
    const match = Object.entries(files).find(([name]) => filePath.endsWith(name));
    if (!match) throw new Error(`unexpected read in test double: ${filePath}`);
    return JSON.stringify(match[1]);
  };

  vi.doMock('node:fs', () => ({ default: { existsSync, readFileSync }, existsSync, readFileSync }));
}

const VALID_DB = { host: 'db-host', port: 5432, username: 'user', password: 'pass', database: 'catalog' };

describe('dbConfig', () => {
  it('parses a valid db section layered from default.json and the NODE_ENV file', async () => {
    process.env.NODE_ENV = 'staging';
    mockConfigFiles({
      'default.json': { db: VALID_DB },
      'staging.json': { db: { port: '5433' } },
    });

    const { dbConfig } = await import('@common/db/dbConfig.js');

    // The NODE_ENV file layers on top of (not replaces) default.json, and the string port is coerced to a number.
    expect(dbConfig).toEqual({ ...VALID_DB, port: 5433 });
  });

  it('falls back to "development" and treats a missing NODE_ENV file as empty, using default.json alone', async () => {
    delete process.env.NODE_ENV;
    mockConfigFiles({ 'default.json': { db: VALID_DB } });

    const { dbConfig } = await import('@common/db/dbConfig.js');

    expect(dbConfig).toEqual(VALID_DB);
  });

  it('treats a non-object top-level config file (e.g. a bare string) as empty', async () => {
    process.env.NODE_ENV = 'test';
    mockConfigFiles({ 'default.json': 'not-an-object', 'test.json': { db: VALID_DB } });

    const { dbConfig } = await import('@common/db/dbConfig.js');

    expect(dbConfig).toEqual(VALID_DB);
  });

  it('treats a null top-level config file as empty', async () => {
    process.env.NODE_ENV = 'test';
    mockConfigFiles({ 'default.json': null, 'test.json': { db: VALID_DB } });

    const { dbConfig } = await import('@common/db/dbConfig.js');

    expect(dbConfig).toEqual(VALID_DB);
  });

  it('treats an array top-level config file as empty', async () => {
    process.env.NODE_ENV = 'test';
    mockConfigFiles({ 'default.json': [1, 2, 3], 'test.json': { db: VALID_DB } });

    const { dbConfig } = await import('@common/db/dbConfig.js');

    expect(dbConfig).toEqual(VALID_DB);
  });

  it('treats a non-object "db" field as absent', async () => {
    process.env.NODE_ENV = 'test';
    mockConfigFiles({ 'default.json': { db: 'oops' }, 'test.json': { db: VALID_DB } });

    const { dbConfig } = await import('@common/db/dbConfig.js');

    expect(dbConfig).toEqual(VALID_DB);
  });

  it('throws a descriptive error when the merged db config is missing required fields', async () => {
    process.env.NODE_ENV = 'test';
    mockConfigFiles({ 'default.json': {}, 'test.json': {} });

    await expect(import('@common/db/dbConfig.js')).rejects.toThrow(/Invalid database configuration[\s\S]*db\.host[\s\S]*config\/default\.json/);
  });
});
