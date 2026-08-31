import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVICES } from '@common/constants';

afterEach(() => {
  vi.doUnmock('@src/app');
  vi.doUnmock('node:http');
  vi.doUnmock('@godaddy/terminus');
  vi.restoreAllMocks();
  vi.resetModules();
});

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('index bootstrap', () => {
  it('should builds the app, wires terminus with the resolved onSignal, and starts listening on the configured port', async () => {
    const logger = { info: vi.fn() };
    const config = { get: vi.fn().mockReturnValue(4000) };
    const onSignal = vi.fn();
    const container = {
      resolve: vi.fn((token: unknown) => {
        if (token === SERVICES.LOGGER) return logger;
        if (token === SERVICES.CONFIG) return config;
        if (token === 'onSignal') return onSignal;
        throw new Error(`unexpected token resolved in test double: ${String(token)}`);
      }),
    };
    const app = { fakeApp: true };
    vi.doMock('@src/app', () => ({ getApp: vi.fn().mockResolvedValue([app, container]) }));

    const httpServer = { listen: vi.fn((_port: number, cb: () => void) => cb()) };
    const createServerMock = vi.fn().mockReturnValue(httpServer);
    vi.doMock('node:http', () => ({ createServer: createServerMock }));

    const createTerminusMock = vi.fn().mockReturnValue(httpServer);
    vi.doMock('@godaddy/terminus', () => ({ createTerminus: createTerminusMock }));

    await import('@src/index.js');
    await flushMicrotasks();

    expect(createServerMock).toHaveBeenCalledWith(app);
    expect(config.get).toHaveBeenCalledWith('server.port');
    expect(httpServer.listen).toHaveBeenCalledWith(4000, expect.any(Function));
    expect(logger.info).toHaveBeenCalledWith('app started on port 4000');

    const [terminusTarget, options] = createTerminusMock.mock.calls[0] as [
      typeof httpServer,
      { onSignal: typeof onSignal; healthChecks: Record<string, () => Promise<void>> },
    ];

    expect(terminusTarget).toBe(httpServer);
    expect(options.onSignal).toBe(onSignal);
    await expect(options.healthChecks['/liveness']?.()).resolves.toBeUndefined();
  });

  it('should logs the error and exits with code 1 when initialization fails', async () => {
    const initError = new Error('boom');
    vi.doMock('@src/app', () => ({ getApp: vi.fn().mockRejectedValue(initError) }));
    vi.doMock('node:http', () => ({ createServer: vi.fn() }));
    vi.doMock('@godaddy/terminus', () => ({ createTerminus: vi.fn() }));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await import('@src/index.js');
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalledWith('😢 - failed initializing the server');
    expect(errorSpy).toHaveBeenCalledWith(initError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
