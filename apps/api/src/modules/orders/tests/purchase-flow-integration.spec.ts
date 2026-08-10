/**
 * Purchase-flow integration test (real DB, real login, real assertions).
 *
 * Verifies the customer purchase path end-to-end up to wallet deduction +
 * order creation (without real upstream fulfillment, which the worker handles):
 *   seed resource + inventory + pricing -> login -> GET quote -> POST order
 *
 * Requires a real PostgreSQL test DB via DATABASE_URL_TEST.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma } from '@ipeasy/db';
import Decimal from 'decimal.js';
import {
  createTestApp,
  cleanDatabase,
  seedSite,
  seedTenant,
  seedAdminUser,
  seedUser,
  loginAs,
  TestRequest,
} from '../../../test-utils/integration-setup';
import { FulfillStaticProxyUseCase } from '../../fulfillment/use-cases/fulfill-static-proxy.use-case';

let app: NestFastifyApplication;
let request: TestRequest;
let fulfillStaticProxy: FulfillStaticProxyUseCase;

let siteId: string;
let tenantId: string;
let userId: string;

const USER_EMAIL = 'buyer@example.com';
const USER_PW = 'pw-12345';
const ADMIN_EMAIL = 'pricing-admin@example.com';
const CURRENCY = 'CNY';

// Helper: seed a saleable resource + fresh inventory + a default-template price rule.
async function seedSaleableResource(opts: {
  code: string;
  unitPrice: string;
  durationDays: number;
  stock: number;
  templateId: string;
  providerCode?: string;
  isStale?: boolean;
}): Promise<string> {
  const resource = await prisma.platform_resources.create({
    data: {
      siteId,
      providerCode: opts.providerCode ?? 'UPSTREAM_API',
      type: 'COUNTRY',
      code: opts.code,
      name: opts.code,
      ipType: 'NATIVE',
      protocol: 'BOTH',
      status: 'ACTIVE',
      isSaleable: true,
      isVisible: true,
    },
  });
  await prisma.inventory_snapshots.create({
    data: {
      siteId,
      resourceId: resource.id,
      providerCode: opts.providerCode ?? 'UPSTREAM_API',
      stock: opts.stock,
      capturedAt: new Date(),
      freshnessTtlSeconds: 3600,
      isStale: opts.isStale ?? false,
    },
  });
  await prisma.price_rules.create({
    data: {
      siteId,
      templateId: opts.templateId,
      resourceId: resource.id,
      durationDays: opts.durationDays,
      unitPrice: new Decimal(opts.unitPrice),
      currency: CURRENCY,
      minQty: 1,
    },
  });
  return resource.id;
}

async function seedDefaultTemplate(): Promise<string> {
  const t = await prisma.price_templates.create({
    data: { siteId, name: 'Default', isDefault: true },
  });
  return t.id;
}

beforeAll(async () => {
  app = await createTestApp();
  request = supertest(app.getHttpServer());
  fulfillStaticProxy = app.get(FulfillStaticProxyUseCase);
});

afterAll(async () => {
  await cleanDatabase();
  await app?.close();
});

beforeEach(async () => {
  await cleanDatabase();
  siteId = await seedSite();
  tenantId = await seedTenant(siteId);
  ({ userId } = await seedUser(siteId, tenantId, { email: USER_EMAIL, password: USER_PW, currency: CURRENCY }));
});

describe('purchase flow', () => {
  it('GET /api/pricing/quote 返回默认模板价格', async () => {
    const templateId = await seedDefaultTemplate();
    const resourceId = await seedSaleableResource({ code: 'JP', unitPrice: '24', durationDays: 30, stock: 100, templateId });
    const token = await loginAs(request, USER_EMAIL, USER_PW, siteId);

    const res = await request
      .get('/api/pricing/quote')
      .query({ resourceId, durationDays: '30', quantity: '2', currency: CURRENCY })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.unitPrice).toBe('24');
    expect(res.body.data.totalPrice).toBe('48');
    expect(res.body.data.priceSource).toBe('DEFAULT_TEMPLATE');
    expect(res.body.data.isSaleable).toBe(true);
  });

  it('admin price override updates matrix and customer quote', async () => {
    await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', { email: ADMIN_EMAIL, password: USER_PW });
    const templateId = await seedDefaultTemplate();
    const resourceId = await seedSaleableResource({ code: 'SG', unitPrice: '24', durationDays: 30, stock: 100, templateId });
    const adminToken = await loginAs(request, ADMIN_EMAIL, USER_PW, siteId);
    const userToken = await loginAs(request, USER_EMAIL, USER_PW, siteId);

    const beforeMatrix = await request
      .get('/api/pricing/matrix')
      .query({ durationDays: '30', currency: CURRENCY, pageSize: '1000' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(beforeMatrix.status).toBe(200);
    expect(beforeMatrix.body.data.items).toEqual([
      expect.objectContaining({
        resourceId,
        effectivePrice: '24',
        overridePrice: null,
        currency: CURRENCY,
      }),
    ]);

    const overrideRes = await request
      .post('/api/pricing/overrides')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resourceId, durationDays: 30, unitPrice: '18.5', currency: CURRENCY });

    expect([200, 201]).toContain(overrideRes.status);

    const afterMatrix = await request
      .get('/api/pricing/matrix')
      .query({ durationDays: '30', currency: CURRENCY, pageSize: '1000' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(afterMatrix.status).toBe(200);
    expect(afterMatrix.body.data.items).toEqual([
      expect.objectContaining({
        resourceId,
        effectivePrice: '18.5',
        overridePrice: '18.5',
        currency: CURRENCY,
      }),
    ]);

    const quote = await request
      .get('/api/pricing/quote')
      .query({ resourceId, durationDays: '30', quantity: '2', currency: CURRENCY })
      .set('Authorization', `Bearer ${userToken}`);

    expect(quote.status).toBe(200);
    expect(quote.body.data.unitPrice).toBe('18.5');
    expect(quote.body.data.totalPrice).toBe('37');
    expect(quote.body.data.priceSource).toBe('RESOURCE_OVERRIDE');
  });

  it('admin price override updates managed provider customer quote', async () => {
    await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', { email: ADMIN_EMAIL, password: USER_PW });
    const templateId = await seedDefaultTemplate();
    const resourceId = await seedSaleableResource({
      code: 'SG:line-sg-recommended',
      providerCode: 'IPIPD',
      unitPrice: '24',
      durationDays: 30,
      stock: 100,
      templateId,
    });
    const adminToken = await loginAs(request, ADMIN_EMAIL, USER_PW, siteId);
    const userToken = await loginAs(request, USER_EMAIL, USER_PW, siteId);

    const overrideRes = await request
      .post('/api/pricing/overrides')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resourceId, durationDays: 30, unitPrice: '18.5', currency: CURRENCY });

    expect([200, 201]).toContain(overrideRes.status);

    const quote = await request
      .get('/api/pricing/quote')
      .query({ resourceId, durationDays: '30', quantity: '2', currency: CURRENCY })
      .set('Authorization', `Bearer ${userToken}`);

    expect(quote.status).toBe(200);
    expect(quote.body.data.unitPrice).toBe('18.5');
    expect(quote.body.data.totalPrice).toBe('37');
    expect(quote.body.data.priceSource).toBe('RESOURCE_OVERRIDE');
  });

  it('user price override has priority over resource override', async () => {
    await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', { email: ADMIN_EMAIL, password: USER_PW });
    const templateId = await seedDefaultTemplate();
    const resourceId = await seedSaleableResource({ code: 'TH', unitPrice: '24', durationDays: 30, stock: 100, templateId });
    const adminToken = await loginAs(request, ADMIN_EMAIL, USER_PW, siteId);
    const userToken = await loginAs(request, USER_EMAIL, USER_PW, siteId);

    await request
      .post('/api/pricing/overrides')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resourceId, durationDays: 30, unitPrice: '18.5', currency: CURRENCY });
    await request
      .post('/api/pricing/user-overrides')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tenantId, userId, resourceId, durationDays: 30, unitPrice: '12.5', currency: CURRENCY });

    const quote = await request
      .get('/api/pricing/quote')
      .query({ resourceId, durationDays: '30', quantity: '2', currency: CURRENCY })
      .set('Authorization', `Bearer ${userToken}`);

    expect(quote.status).toBe(200);
    expect(quote.body.data.unitPrice).toBe('12.5');
    expect(quote.body.data.totalPrice).toBe('25');
    expect(quote.body.data.priceSource).toBe('USER_OVERRIDE');
  });

  it('库存为 0 → quote 返回 UPSTREAM_OUT_OF_STOCK', async () => {
    const templateId = await seedDefaultTemplate();
    const resourceId = await seedSaleableResource({ code: 'JP', unitPrice: '24', durationDays: 30, stock: 0, templateId });
    const token = await loginAs(request, USER_EMAIL, USER_PW, siteId);

    const res = await request
      .get('/api/pricing/quote')
      .query({ resourceId, durationDays: '30', quantity: '1', currency: CURRENCY })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('UPSTREAM_OUT_OF_STOCK');
    expect(res.body.data.reasonKey).toBe('out_of_stock');
  });

  it('PR stock 0 returns UPSTREAM_OUT_OF_STOCK', async () => {
    const templateId = await seedDefaultTemplate();
    const resourceId = await seedSaleableResource({
      providerCode: 'PR',
      code: 'SG',
      unitPrice: '24',
      durationDays: 30,
      stock: 0,
      templateId,
    });
    const token = await loginAs(request, USER_EMAIL, USER_PW, siteId);

    const res = await request
      .get('/api/pricing/quote')
      .query({ resourceId, durationDays: '30', quantity: '1', currency: CURRENCY })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('UPSTREAM_OUT_OF_STOCK');
    expect(res.body.data.reasonKey).toBe('out_of_stock');
  });

  it('PR stale inventory returns a visible upstream inventory error', async () => {
    const templateId = await seedDefaultTemplate();
    const resourceId = await seedSaleableResource({
      providerCode: 'PR',
      code: 'CA',
      unitPrice: '10',
      durationDays: 30,
      stock: 0,
      templateId,
      isStale: true,
    });
    const token = await loginAs(request, USER_EMAIL, USER_PW, siteId);

    const res = await request
      .get('/api/pricing/quote')
      .query({ resourceId, durationDays: '30', quantity: '1', currency: CURRENCY })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(['UPSTREAM_ERROR', 'UPSTREAM_DISABLED']).toContain(res.body.code);
  });

  it('无价格规则 → quote 使用平台基础售价，保证上游资源可购买', async () => {
    await seedDefaultTemplate();
    // resource with inventory but no price rule
    const resource = await prisma.platform_resources.create({
      data: { siteId, providerCode: 'UPSTREAM_API', type: 'COUNTRY', code: 'KR', name: 'KR', ipType: 'NATIVE', protocol: 'BOTH', status: 'ACTIVE', isSaleable: true, isVisible: true },
    });
    await prisma.inventory_snapshots.create({
      data: { siteId, resourceId: resource.id, providerCode: 'UPSTREAM_API', stock: 50, capturedAt: new Date(), freshnessTtlSeconds: 3600, isStale: false },
    });
    const token = await loginAs(request, USER_EMAIL, USER_PW, siteId);

    const res = await request
      .get('/api/pricing/quote')
      .query({ resourceId: resource.id, durationDays: '30', quantity: '1', currency: CURRENCY })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.unitPrice).toBe('39');
    expect(res.body.data.totalPrice).toBe('39');
    expect(res.body.data.priceSource).toBe('DEFAULT_TEMPLATE');
  });

  it('余额充足 → 下单扣款 + 建订单 + 建履约任务', async () => {
    const templateId = await seedDefaultTemplate();
    const resourceId = await seedSaleableResource({ code: 'JP', unitPrice: '24', durationDays: 30, stock: 100, templateId });
    // top up wallet to 100
    await prisma.wallets.update({ where: { userId }, data: { available: new Decimal('100') } });
    const token = await loginAs(request, USER_EMAIL, USER_PW, siteId);

    const res = await request
      .post('/api/orders/static-proxy')
      .set('Authorization', `Bearer ${token}`)
      .send({ resourceId, quantity: 2, durationDays: 30, currency: CURRENCY, idempotencyKey: 'buy-1' });

    expect([200, 201]).toContain(res.status);

    // wallet deducted: 100 - 48 = 52
    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { userId } });
    expect(wallet.available.toString()).toBe('52');

    // order + ledger + fulfillment job created
    const orders = await prisma.orders.findMany({ where: { userId } });
    expect(orders).toHaveLength(1);
    expect(orders[0]!.totalPrice.toString()).toBe('48');

    const ledger = await prisma.ledger_entries.findMany({ where: { userId, type: 'DEBIT' } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.amount.toString()).toBe('-48');

    const jobs = await prisma.fulfillment_jobs.findMany({ where: { orderId: orders[0]!.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe('QUEUED');
  });

  it('余额不足 → 下单返回 WALLET_INSUFFICIENT_BALANCE，不建订单', async () => {
    const templateId = await seedDefaultTemplate();
    const resourceId = await seedSaleableResource({ code: 'JP', unitPrice: '24', durationDays: 30, stock: 100, templateId });
    // wallet has only 10
    await prisma.wallets.update({ where: { userId }, data: { available: new Decimal('10') } });
    const token = await loginAs(request, USER_EMAIL, USER_PW, siteId);

    const res = await request
      .post('/api/orders/static-proxy')
      .set('Authorization', `Bearer ${token}`)
      .send({ resourceId, quantity: 2, durationDays: 30, currency: CURRENCY, idempotencyKey: 'buy-2' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('WALLET_INSUFFICIENT_BALANCE');

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { userId } });
    expect(wallet.available.toString()).toBe('10'); // unchanged
    const orders = await prisma.orders.findMany({ where: { userId } });
    expect(orders).toHaveLength(0);
  });

  it('同 idempotencyKey 重复下单 → 返回同一订单，不重复扣款', async () => {
    const templateId = await seedDefaultTemplate();
    const resourceId = await seedSaleableResource({ code: 'JP', unitPrice: '24', durationDays: 30, stock: 100, templateId });
    await prisma.wallets.update({ where: { userId }, data: { available: new Decimal('100') } });
    const token = await loginAs(request, USER_EMAIL, USER_PW, siteId);

    const body = { resourceId, quantity: 1, durationDays: 30, currency: CURRENCY, idempotencyKey: 'buy-dup' };
    const res1 = await request.post('/api/orders/static-proxy').set('Authorization', `Bearer ${token}`).send(body);
    const res2 = await request.post('/api/orders/static-proxy').set('Authorization', `Bearer ${token}`).send(body);

    expect([200, 201]).toContain(res1.status);
    expect([200, 201]).toContain(res2.status);

    const orders = await prisma.orders.findMany({ where: { userId } });
    expect(orders).toHaveLength(1);
    // deducted once: 100 - 24 = 76
    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { userId } });
    expect(wallet.available.toString()).toBe('76');
  });

  it('scopes idempotency keys by customer', async () => {
    const templateId = await seedDefaultTemplate();
    const resourceId = await seedSaleableResource({ code: 'TW', unitPrice: '24', durationDays: 30, stock: 100, templateId });
    const { userId: secondUserId } = await seedUser(siteId, tenantId, {
      email: 'buyer-two@example.com',
      password: USER_PW,
      currency: CURRENCY,
    });
    await prisma.wallets.update({ where: { userId }, data: { available: new Decimal('100') } });
    await prisma.wallets.update({ where: { userId: secondUserId }, data: { available: new Decimal('100') } });
    const token1 = await loginAs(request, USER_EMAIL, USER_PW, siteId);
    const token2 = await loginAs(request, 'buyer-two@example.com', USER_PW, siteId);
    const body = { resourceId, quantity: 1, durationDays: 30, currency: CURRENCY, idempotencyKey: 'shared-user-key' };

    const res1 = await request.post('/api/orders/static-proxy').set('Authorization', `Bearer ${token1}`).send(body);
    const res2 = await request.post('/api/orders/static-proxy').set('Authorization', `Bearer ${token2}`).send(body);

    expect([200, 201]).toContain(res1.status);
    expect([200, 201]).toContain(res2.status);
    expect(res2.body.data.orderId).not.toBe(res1.body.data.orderId);
    const orders = await prisma.orders.findMany({ where: { idempotencyKey: 'shared-user-key' } });
    expect(orders).toHaveLength(2);
  });

  it('scopes fulfillment refund ledger keys by customer and order', async () => {
    const templateId = await seedDefaultTemplate();
    const resourceId = await seedSaleableResource({ code: 'TW', unitPrice: '24', durationDays: 30, stock: 100, templateId });
    const { userId: secondUserId } = await seedUser(siteId, tenantId, {
      email: 'buyer-refund-two@example.com',
      password: USER_PW,
      currency: CURRENCY,
    });
    await prisma.wallets.update({ where: { userId }, data: { available: new Decimal('100') } });
    await prisma.wallets.update({ where: { userId: secondUserId }, data: { available: new Decimal('100') } });
    const token1 = await loginAs(request, USER_EMAIL, USER_PW, siteId);
    const token2 = await loginAs(request, 'buyer-refund-two@example.com', USER_PW, siteId);
    const body = { resourceId, quantity: 1, durationDays: 30, currency: CURRENCY, idempotencyKey: 'shared-refund-key' };

    const res1 = await request.post('/api/orders/static-proxy').set('Authorization', `Bearer ${token1}`).send(body);
    const res2 = await request.post('/api/orders/static-proxy').set('Authorization', `Bearer ${token2}`).send(body);
    expect([200, 201]).toContain(res1.status);
    expect([200, 201]).toContain(res2.status);

    const orders = await prisma.orders.findMany({
      where: { idempotencyKey: 'shared-refund-key' },
      orderBy: { createdAt: 'asc' },
    });
    expect(orders).toHaveLength(2);
    const jobs = await prisma.fulfillment_jobs.findMany({
      where: { orderId: { in: orders.map((order) => order.id) } },
      orderBy: { createdAt: 'asc' },
    });
    expect(jobs).toHaveLength(2);
    await prisma.fulfillment_jobs.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: { attempts: 2, maxAttempts: 3 },
    });

    await expect(fulfillStaticProxy.execute(jobs[0]!.id)).resolves.toMatchObject({ status: 'FAILED_REFUNDED' });
    await expect(fulfillStaticProxy.execute(jobs[1]!.id)).resolves.toMatchObject({ status: 'FAILED_REFUNDED' });

    const refundEntries = await prisma.ledger_entries.findMany({
      where: { relatedId: { in: orders.map((order) => order.id) }, type: 'REFUND' },
      orderBy: { createdAt: 'asc' },
    });
    expect(refundEntries).toHaveLength(2);
    expect(new Set(refundEntries.map((entry) => entry.idempotencyKey)).size).toBe(2);
    expect(refundEntries.map((entry) => entry.amount.toString()).sort()).toEqual(['24', '24']);

    const wallet1 = await prisma.wallets.findUniqueOrThrow({ where: { userId } });
    const wallet2 = await prisma.wallets.findUniqueOrThrow({ where: { userId: secondUserId } });
    expect(wallet1.available.toString()).toBe('100');
    expect(wallet2.available.toString()).toBe('100');
  });
});
