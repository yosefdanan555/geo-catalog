import { describe, expect, it, vi } from 'vitest';

describe('config', () => {
  it('should getConfig throws before initConfig has been called', async () => {
    vi.resetModules();
    // The .js extension (not this project's actual .ts source) matches the NodeNext-style
    // specifier TypeScript expects at this path — without it, the dynamic import's type can't
    // be resolved and everything destructured from it silently becomes `any`.
    const { getConfig } = await import('@common/config.js');

    expect(() => getConfig()).toThrow('config not initialized');
  });

  it('should getConfig returns the instance initConfig set up (offline mode)', async () => {
    vi.resetModules();
    const { initConfig, getConfig } = await import('@common/config.js');

    await initConfig(true);

    expect(getConfig()).toBeDefined();
    expect(getConfig().get('server.port')).toEqual(expect.any(Number));
  });
});
