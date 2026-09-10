import { describe, expect, it } from 'vitest';
import { buildProviderPlans, providerBootstrapExitCode, syncProviderPlans } from './provider-bootstrap-plans';

describe('provider bootstrap plans', () => {
  it('returns a failing process code when any enabled provider sync failed', () => {
    expect(providerBootstrapExitCode(true)).toBe(1);
    expect(providerBootstrapExitCode(false)).toBe(0);
  });

  it('persists the configured 985Proxy zone with the API key', () => {
    const plans = buildProviderPlans({
      NINE_EIGHT_FIVE_APIKEY: 'api-key',
      NINE_EIGHT_FIVE_ZONE_ID: 'zone-1',
    });

    expect(plans).toContainEqual({
      code: 'NINE_EIGHT_FIVE',
      baseUrl: 'https://open-api.985proxy.com',
      credential: { apikey: 'api-key', zoneId: 'zone-1' },
      sync: true,
    });
  });

  it('omits an unset optional zone instead of persisting an empty credential field', () => {
    const plans = buildProviderPlans({ NINE_EIGHT_FIVE_APIKEY: 'api-key', NINE_EIGHT_FIVE_ZONE_ID: '  ' });

    expect(plans).toContainEqual({
      code: 'NINE_EIGHT_FIVE',
      baseUrl: 'https://open-api.985proxy.com',
      credential: { apikey: 'api-key' },
      sync: true,
    });
  });

  it('attempts every enabled provider and reports failed syncs without hiding them', async () => {
    const plans = [
      { code: 'IPIPD' as const, baseUrl: 'https://api.ipipd.cn', credential: {}, sync: true },
      { code: 'NINE_EIGHT_FIVE' as const, baseUrl: 'https://open-api.985proxy.com', credential: {}, sync: true },
      { code: 'PR' as const, baseUrl: 'https://proxy-seller.com/personal/api/v1', credential: {}, sync: false },
    ];
    const accountIds = new Map([
      ['IPIPD' as const, 'account-ipipd'],
      ['NINE_EIGHT_FIVE' as const, 'account-985'],
      ['PR' as const, 'account-pr'],
    ]);
    const attempted: string[] = [];

    const result = await syncProviderPlans(plans, accountIds, async (plan, accountId) => {
      attempted.push(`${plan.code}:${accountId}`);
      if (plan.code === 'NINE_EIGHT_FIVE') throw new Error('upstream unavailable');
      return { synced: 2, created: 1, updated: 1, countries: ['US'] };
    });

    expect(attempted).toEqual(['IPIPD:account-ipipd', 'NINE_EIGHT_FIVE:account-985']);
    expect(result.failedProviders).toEqual(['NINE_EIGHT_FIVE']);
    expect(result.outcomes).toEqual([
      expect.objectContaining({ code: 'IPIPD', status: 'SUCCESS' }),
      expect.objectContaining({ code: 'NINE_EIGHT_FIVE', status: 'FAILED', error: expect.any(Error) }),
    ]);
  });
});
