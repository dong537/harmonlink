import type { ProviderCode } from './provider.types';

export type NativeBootstrapProvider = Extract<ProviderCode, 'IPIPD' | 'NINE_EIGHT_FIVE' | 'PR'>;

export interface ProviderBootstrapPlan {
  code: NativeBootstrapProvider;
  baseUrl: string;
  credential: Record<string, string>;
  sync: boolean;
}

export interface ProviderSyncOutcome<T> {
  code: NativeBootstrapProvider;
  status: 'SUCCESS' | 'FAILED';
  result?: T;
  error?: unknown;
}

export interface ProviderSyncBatchResult<T> {
  outcomes: ProviderSyncOutcome<T>[];
  failedProviders: NativeBootstrapProvider[];
}

/**
 * Execute the enabled provider sync plans in deterministic order.
 *
 * The callback owns the actual provider use case; this helper only preserves
 * every outcome so callers cannot accidentally treat a partial sync as a
 * successful bootstrap.
 */
export async function syncProviderPlans<T>(
  plans: readonly ProviderBootstrapPlan[],
  accountIdByProvider: ReadonlyMap<NativeBootstrapProvider, string>,
  sync: (plan: ProviderBootstrapPlan, accountId: string | undefined) => Promise<T>,
): Promise<ProviderSyncBatchResult<T>> {
  const outcomes: ProviderSyncOutcome<T>[] = [];
  const failedProviders: NativeBootstrapProvider[] = [];
  for (const plan of plans) {
    if (!plan.sync) continue;
    try {
      const result = await sync(plan, accountIdByProvider.get(plan.code));
      outcomes.push({ code: plan.code, status: 'SUCCESS', result });
    } catch (error: unknown) {
      failedProviders.push(plan.code);
      outcomes.push({ code: plan.code, status: 'FAILED', error });
    }
  }
  return { outcomes, failedProviders };
}

export function providerBootstrapExitCode(syncFailed: boolean): 0 | 1 {
  return syncFailed ? 1 : 0;
}

export function buildProviderPlans(env: Readonly<Record<string, string | undefined>>): ProviderBootstrapPlan[] {
  const plans: ProviderBootstrapPlan[] = [];
  const ipipdId = env.IPIPD_APP_ID?.trim();
  const ipipdSecret = env.IPIPD_APP_SECRET?.trim();
  if (ipipdId && ipipdSecret) {
    plans.push({
      code: 'IPIPD',
      baseUrl: env.IPIPD_BASE_URL?.trim() || 'https://api.ipipd.cn',
      credential: { appId: ipipdId, appSecret: ipipdSecret },
      sync: true,
    });
  }

  const apiKey = env.NINE_EIGHT_FIVE_APIKEY?.trim();
  if (apiKey) {
    const zoneId = env.NINE_EIGHT_FIVE_ZONE_ID?.trim();
    plans.push({
      code: 'NINE_EIGHT_FIVE',
      baseUrl: 'https://open-api.985proxy.com',
      credential: { apikey: apiKey, ...(zoneId ? { zoneId } : {}) },
      sync: true,
    });
  }

  const prKey = env.PR_APIKEY?.trim();
  if (prKey) {
    plans.push({
      code: 'PR',
      baseUrl: 'https://proxy-seller.com/personal/api/v1',
      credential: { apikey: prKey },
      sync: env.BOOTSTRAP_SYNC_PR === 'true',
    });
  }
  return plans;
}
