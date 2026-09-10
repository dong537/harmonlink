import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import type { ConfigService } from '../../common/config/config.service';
import { assertLegacyApiAccess } from './legacy-site-access';

const context: Pick<AuthenticatedContext, 'siteId'> = { siteId: 'site-1' };

function config(values: { enabled?: unknown; siteId?: unknown }) {
  const get = vi.fn((key: string) => key === 'LEGACY_API_V1_ENABLED' ? values.enabled : values.siteId);
  return { get } as unknown as ConfigService & { get: ReturnType<typeof vi.fn> };
}

describe('assertLegacyApiAccess', () => {
  it('rejects the compatibility surface when disabled without reading site configuration', () => {
    const candidate = config({ enabled: 'false', siteId: 'site-1' });

    expect(() => assertLegacyApiAccess(candidate)).toThrow(expect.objectContaining({
      httpStatus: 404,
      reasonKey: 'legacy_api_disabled',
    }));
    expect(candidate.get).toHaveBeenCalledTimes(1);
    expect(candidate.get).toHaveBeenCalledWith('LEGACY_API_V1_ENABLED');
  });

  it.each([undefined, null, '', '   '])('reports missing fixed-site configuration as a typed error (%s)', (siteId) => {
    const candidate = config({ enabled: 'true', siteId });

    expect(() => assertLegacyApiAccess(candidate, context)).toThrow(expect.objectContaining({
      httpStatus: 500,
      reasonKey: 'legacy_api_site_not_configured',
    }));
  });

  it('allows a matching authenticated site and returns the normalized configured ID', () => {
    const candidate = config({ enabled: 'true', siteId: '  site-1  ' });

    expect(assertLegacyApiAccess(candidate, context)).toBe('site-1');
  });

  it('rejects a valid authenticated context from another site', () => {
    const candidate = config({ enabled: 'true', siteId: 'site-1' });

    expect(() => assertLegacyApiAccess(candidate, { siteId: 'site-2' })).toThrow(expect.objectContaining({
      httpStatus: 403,
      reasonKey: 'legacy_api_site_mismatch',
    }));
  });
});
