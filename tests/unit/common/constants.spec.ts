import { describe, expect, it, vi } from 'vitest';

describe('constants', () => {
  it('SERVICE_NAME falls back to "unknown_service" when the package has no name', async () => {
    vi.resetModules();
    vi.doMock('@map-colonies/read-pkg', () => ({ readPackageJsonSync: () => ({}) }));

    const { SERVICE_NAME } = await import('@common/constants.js');

    expect(SERVICE_NAME).toBe('unknown_service');

    vi.doUnmock('@map-colonies/read-pkg');
  });

  it('SERVICE_NAME uses the real package.json name otherwise', async () => {
    vi.resetModules();

    const { SERVICE_NAME } = await import('@common/constants.js');

    expect(SERVICE_NAME).toBe('geospatial-catalog-service');
  });
});
