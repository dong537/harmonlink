// One-shot production bootstrap: configure native providers from env, run a
// real inventory sync, then seed the default price template. Idempotent.
//
// Credentials come from env vars (never committed, never logged):
//   IPIPD_APP_ID, IPIPD_APP_SECRET
//   NINE_EIGHT_FIVE_APIKEY, NINE_EIGHT_FIVE_ZONE_ID
//   PR_APIKEY
// Optional: BOOTSTRAP_SYNC_PR=true to sync PR after its IP allowlist is set.
import './_cli-bootstrap';
import { NestFactory } from '@nestjs/core';
import { prisma } from '@ipeasy/db';
import { encryptAesGcm } from '../src/common/crypto/aes-gcm';
import { CURRENT_PROVIDER_ACCOUNT_ORDER_BY } from '../src/modules/providers/provider-account-order';
import { AppModule } from '../src/app.module';
import { SyncInventoryUseCase } from '../src/modules/resources/use-cases/sync-inventory.use-case';
import { assertProviderBaseUrl, assertProviderCredential, writeCliAudit } from './_provider-ops';
import { seedPricing } from './seed-pricing';
import {
  buildProviderPlans,
  providerBootstrapExitCode,
  syncProviderPlans,
  type NativeBootstrapProvider,
  type ProviderBootstrapPlan,
} from '../src/modules/providers/provider-bootstrap-plans';

type NativeProvider = NativeBootstrapProvider;
type ProviderPlan = ProviderBootstrapPlan;

async function upsertAccount(siteId: string, plan: ProviderPlan, encryptionKey: string): Promise<string> {
  const credentialObj = assertProviderCredential(plan.code, plan.credential);
  const baseUrl = assertProviderBaseUrl(plan.code, plan.baseUrl);
  const credentialEncrypted = encryptAesGcm(JSON.stringify(credentialObj), encryptionKey);
  const existing = await prisma.provider_accounts.findFirst({
    where: { siteId, tenantId: null, providerCode: plan.code },
    orderBy: CURRENT_PROVIDER_ACCOUNT_ORDER_BY,
  });
  const data = { status: 'ACTIVE' as const, credentialEncrypted, baseUrl, timeoutMs: 15000, inventorySyncEnabled: true };
  let accountId: string;
  if (existing) {
    await prisma.provider_accounts.update({ where: { id: existing.id }, data });
    accountId = existing.id;
  } else {
    const created = await prisma.provider_accounts.create({ data: { siteId, tenantId: null, providerCode: plan.code, ...data } });
    accountId = created.id;
  }
  await writeCliAudit({
    siteId,
    tenantId: null,
    action: existing ? 'provider.credential.update' : 'provider.credential.create',
    targetType: 'provider_account',
    targetId: accountId,
    requestId: `cli:provider:bootstrap:${plan.code}:${accountId}`,
    meta: { providerCode: plan.code, status: 'ACTIVE', baseUrl, timeoutMs: 15000, inventorySyncEnabled: true },
  });
  console.log(`[provider] ${plan.code}: ${existing ? 'updated' : 'created'} account ${accountId} (base ${baseUrl})`);
  return accountId;
}

async function main(): Promise<number> {
  const encryptionKey = process.env.APP_ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.error('bootstrap: APP_ENCRYPTION_KEY missing');
    return 1;
  }

  const site = await prisma.sites.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!site) {
    console.error('bootstrap: no site found');
    return 1;
  }
  console.log(`[bootstrap] site=${site.code} (${site.id})`);

  const plans = buildProviderPlans(process.env);
  if (plans.length === 0) {
    console.error('bootstrap: no provider credentials in env, nothing to do');
    return 1;
  }

  const accountIdByProvider = new Map<NativeProvider, string>();
  for (const plan of plans) {
    const accountId = await upsertAccount(site.id, plan, encryptionKey);
    accountIdByProvider.set(plan.code, accountId);
  }

  // Inventory sync uses the real use case and never writes synthetic stock.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const syncInventory = app.get(SyncInventoryUseCase, { strict: false });
    const syncResult = await syncProviderPlans(plans, accountIdByProvider, (plan, accountId) =>
      syncInventory.execute(site.id, plan.code, null, accountId),
    );

    for (const outcome of syncResult.outcomes) {
      if (outcome.status === 'SUCCESS') {
        const result = outcome.result;
        console.log(`[sync] ${outcome.code}: synced ${result?.synced ?? 0} resource(s), created=${result?.created ?? 0}, updated=${result?.updated ?? 0}, countries=${result?.countries?.join(',') ?? ''}`);
      } else {
        // Surface upstream failures (allowlist/auth) loudly; do not fake inventory.
        console.error(`[sync] ${outcome.code}: FAILED - ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`);
      }
    }

    // A provider sync failure means inventory is not trustworthy. Do not seed
    // pricing or return success while an enabled provider is unavailable.
    if (syncResult.failedProviders.length > 0) {
      console.error(`bootstrap: inventory sync failed for ${syncResult.failedProviders.join(',')}; refusing success`);
      return providerBootstrapExitCode(true);
    }
  } finally {
    await app.close();
  }

  // Seed the default price template only after every enabled sync succeeded.
  const pricing = await seedPricing(site.id);
  console.log(`[pricing] template=${pricing.templateId} rules=${pricing.ruleCount}`);
  return 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    console.error('provider:bootstrap failed:', err instanceof Error ? err.message : String(err));
    await prisma.$disconnect();
    process.exit(1);
  });
