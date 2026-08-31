import { describe, expect, it, vi } from 'vitest';

describe('tracing', () => {
  it('should getTracing throws before tracingFactory has been called', async () => {
    vi.resetModules();
    const { getTracing } = await import('@common/tracing.js');

    expect(() => getTracing()).toThrow('tracing not initialized');
  });

  it('should tracingFactory initializes the singleton and getTracing returns that same instance', async () => {
    vi.resetModules();
    const { tracingFactory, getTracing } = await import('@common/tracing.js');

    const instance = tracingFactory({ isEnabled: false });

    expect(getTracing()).toBe(instance);
  });

  describe('auto-instrumentation hooks', () => {
    async function buildHooks(): Promise<{
      ignoreIncomingRequestHook: (request: { url?: string }) => boolean;
      ignoreOutgoingRequestHook: (request: { path?: unknown }) => boolean;
    }> {
      vi.resetModules();
      const { tracingFactory } = await import('@common/tracing.js');
      const instance = tracingFactory({ isEnabled: false });
      const configMap = (instance as unknown as { autoInstrumentationsConfigMap: Record<string, unknown> }).autoInstrumentationsConfigMap;
      return configMap['@opentelemetry/instrumentation-http'] as {
        ignoreIncomingRequestHook: (request: { url?: string }) => boolean;
        ignoreOutgoingRequestHook: (request: { path?: unknown }) => boolean;
      };
    }

    it('should ignores incoming requests whose url matches an ignored route', async () => {
      const { ignoreIncomingRequestHook } = await buildHooks();

      expect(ignoreIncomingRequestHook({ url: '/docs/api/' })).toBe(true);
    });

    it('should does not ignore incoming requests outside the ignored routes', async () => {
      const { ignoreIncomingRequestHook } = await buildHooks();

      expect(ignoreIncomingRequestHook({ url: '/product' })).toBe(false);
    });

    it('should does not ignore an incoming request with no url', async () => {
      const { ignoreIncomingRequestHook } = await buildHooks();

      expect(ignoreIncomingRequestHook({})).toBe(false);
    });

    it('should ignores outgoing requests whose path matches an ignored route', async () => {
      const { ignoreOutgoingRequestHook } = await buildHooks();

      expect(ignoreOutgoingRequestHook({ path: '/v1/metrics' })).toBe(true);
    });

    it('should does not ignore outgoing requests outside the ignored routes', async () => {
      const { ignoreOutgoingRequestHook } = await buildHooks();

      expect(ignoreOutgoingRequestHook({ path: '/other' })).toBe(false);
    });

    it('should does not ignore an outgoing request whose path is not a string', async () => {
      const { ignoreOutgoingRequestHook } = await buildHooks();

      expect(ignoreOutgoingRequestHook({ path: undefined })).toBe(false);
    });
  });
});
