import { describe, expect, it, vi } from 'vitest';

describe('tracing', () => {
  it('getTracing throws before tracingFactory has been called', async () => {
    vi.resetModules();
    const { getTracing } = await import('@common/tracing.js');

    expect(() => getTracing()).toThrow('tracing not initialized');
  });

  it('tracingFactory initializes the singleton and getTracing returns that same instance', async () => {
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
      // TypeScript `private` is compile-time only — the constructor really did stash the config
      // object (with our two hooks) on the instance under this field, so it's the only way to
      // reach them without actually calling `start()` and spinning up real OpenTelemetry SDK.
      const configMap = (instance as unknown as { autoInstrumentationsConfigMap: Record<string, unknown> }).autoInstrumentationsConfigMap;
      return configMap['@opentelemetry/instrumentation-http'] as {
        ignoreIncomingRequestHook: (request: { url?: string }) => boolean;
        ignoreOutgoingRequestHook: (request: { path?: unknown }) => boolean;
      };
    }

    it('ignores incoming requests whose url matches an ignored route', async () => {
      const { ignoreIncomingRequestHook } = await buildHooks();

      expect(ignoreIncomingRequestHook({ url: '/docs/api/' })).toBe(true);
    });

    it('does not ignore incoming requests outside the ignored routes', async () => {
      const { ignoreIncomingRequestHook } = await buildHooks();

      expect(ignoreIncomingRequestHook({ url: '/product' })).toBe(false);
    });

    it('does not ignore an incoming request with no url', async () => {
      const { ignoreIncomingRequestHook } = await buildHooks();

      expect(ignoreIncomingRequestHook({})).toBe(false);
    });

    it('ignores outgoing requests whose path matches an ignored route', async () => {
      const { ignoreOutgoingRequestHook } = await buildHooks();

      expect(ignoreOutgoingRequestHook({ path: '/v1/metrics' })).toBe(true);
    });

    it('does not ignore outgoing requests outside the ignored routes', async () => {
      const { ignoreOutgoingRequestHook } = await buildHooks();

      expect(ignoreOutgoingRequestHook({ path: '/other' })).toBe(false);
    });

    it('does not ignore an outgoing request whose path is not a string', async () => {
      const { ignoreOutgoingRequestHook } = await buildHooks();

      expect(ignoreOutgoingRequestHook({ path: undefined })).toBe(false);
    });
  });
});
