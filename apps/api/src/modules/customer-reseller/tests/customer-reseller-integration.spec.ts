import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma } from '@ipeasy/db';
import Decimal from 'decimal.js';
import {
  cleanDatabase,
  createTestApp,
  loginAs,
  seedSite,
  seedTenant,
  seedUser,
  type TestRequest,
} from '../../../test-utils/integration-setup';

const PASSWORD = 'Password123';

describe('customer reseller integration', () => {
  let app: NestFastifyApplication;
  let request: TestRequest;
  let siteId: string;
  let tenantId: string;

  beforeAll(async () => {
    app = await createTestApp();
    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
    siteId = await seedSite();
    tenantId = await seedTenant(siteId);
  });

  it('lets a user create an owned sub-site and then create a real sub-site customer', async () => {
    await seedUser(siteId, tenantId, {
      email: 'reseller-owner@example.com',
      password: PASSWORD,
      currency: 'CNY',
    });
    const ownerToken = await loginAs(request, 'reseller-owner@example.com', PASSWORD, siteId);

    const createTenantRes = await request
      .post('/api/tenants/self-service')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Owner Sub-site', code: 'owner-sub-site' });
    expect(createTenantRes.status).toBe(201);
    const ownedTenantId = createTenantRes.body.data.tenant.id as string;

    const createUserRes = await request
      .post('/api/customer/reseller/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'sub-customer@example.com', password: PASSWORD });
    expect(createUserRes.status).toBe(201);
    expect(createUserRes.body.data).toMatchObject({
      email: 'sub-customer@example.com',
      tenantId: ownedTenantId,
    });

    const storedUser = await prisma.users.findUniqueOrThrow({
      where: { email: 'sub-customer@example.com' },
      include: { wallets: true },
    });
    expect(storedUser.tenantId).toBe(ownedTenantId);
    expect(storedUser.wallets).toHaveLength(1);
    expect(storedUser.wallets[0].currency).toBe('CNY');

    const audit = await prisma.audit_logs.findFirstOrThrow({
      where: { action: 'reseller.user.create', targetId: storedUser.id },
    });
    expect(audit.actorType).toBe('USER');
    expect(audit.tenantId).toBe(ownedTenantId);
  });

  it('lets a reseller sell only selected main-site resources to sub-site customers', async () => {
    await seedUser(siteId, tenantId, {
      email: 'reseller-owner@example.com',
      password: PASSWORD,
      currency: 'CNY',
    });
    const ownerToken = await loginAs(request, 'reseller-owner@example.com', PASSWORD, siteId);
    const resource = await seedMainSiteResource(siteId);

    const createTenantRes = await request
      .post('/api/tenants/self-service')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Owner Sub-site', code: 'owner-products' });
    expect(createTenantRes.status).toBe(201);
    const ownedTenantId = createTenantRes.body.data.tenant.id as string;

    const productsBefore = await request
      .get('/api/customer/reseller/products')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(productsBefore.status).toBe(200);
    expect(productsBefore.body.data.items[0]).toMatchObject({
      resourceId: resource.id,
      enabled: false,
      unitPrice: null,
    });
    expect(productsBefore.body.data.items[0]).not.toHaveProperty('providerCode');
    expect(productsBefore.body.data.items[0]).not.toHaveProperty('upstreamCost');
    expect(productsBefore.body.data.items[0]).not.toHaveProperty('upstreamCostCurrency');

    const createUserRes = await request
      .post('/api/customer/reseller/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'sub-customer@example.com', password: PASSWORD });
    expect(createUserRes.status).toBe(201);
    const customerToken = await loginAs(request, 'sub-customer@example.com', PASSWORD, siteId);

    const hiddenBefore = await request
      .get('/api/resources')
      .query({ pageSize: 20, durationDays: 30, currency: 'CNY' })
      .set('Authorization', `Bearer ${customerToken}`);
    expect(hiddenBefore.status).toBe(200);
    expect(hiddenBefore.body.data.items).toHaveLength(0);

    const saveProduct = await request
      .post('/api/customer/reseller/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ resourceId: resource.id, enabled: true, unitPrice: '28.00', currency: 'CNY' });
    expect(saveProduct.status).toBe(201);

    const productsAfter = await request
      .get('/api/customer/reseller/products')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(productsAfter.body.data.items[0]).toMatchObject({
      resourceId: resource.id,
      enabled: true,
      unitPrice: '28',
      currency: 'CNY',
    });
    expect(productsAfter.body.data.items[0]).not.toHaveProperty('providerCode');
    expect(productsAfter.body.data.items[0]).not.toHaveProperty('upstreamCost');
    expect(productsAfter.body.data.items[0]).not.toHaveProperty('upstreamCostCurrency');

    const visibleAfter = await request
      .get('/api/resources')
      .query({ pageSize: 20, durationDays: 30, currency: 'CNY' })
      .set('Authorization', `Bearer ${customerToken}`);
    expect(visibleAfter.status).toBe(200);
    expect(visibleAfter.body.data.items).toHaveLength(1);
    expect(visibleAfter.body.data.items[0]).toMatchObject({
      id: resource.id,
      unitPrice: '28',
      priceCurrency: 'CNY',
    });

    const tenantDefault = await prisma.price_templates.findFirstOrThrow({
      where: { siteId, tenantId: ownedTenantId, isDefault: true },
      include: { price_rules: true },
    });
    expect(tenantDefault.price_rules).toHaveLength(1);

    const disableProduct = await request
      .post('/api/customer/reseller/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ resourceId: resource.id, enabled: false });
    expect(disableProduct.status).toBe(201);

    const hiddenAfter = await request
      .get('/api/resources')
      .query({ pageSize: 20, durationDays: 30, currency: 'CNY' })
      .set('Authorization', `Bearer ${customerToken}`);
    expect(hiddenAfter.status).toBe(200);
    expect(hiddenAfter.body.data.items).toHaveLength(0);
  });

  it('lets a reseller adjust a sub-site customer wallet with ledger and audit records', async () => {
    await seedUser(siteId, tenantId, {
      email: 'reseller-owner@example.com',
      password: PASSWORD,
      currency: 'CNY',
    });
    const ownerToken = await loginAs(request, 'reseller-owner@example.com', PASSWORD, siteId);

    const createTenantRes = await request
      .post('/api/tenants/self-service')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Owner Sub-site', code: 'owner-wallet' });
    expect(createTenantRes.status).toBe(201);
    const ownedTenantId = createTenantRes.body.data.tenant.id as string;

    const createUserRes = await request
      .post('/api/customer/reseller/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'sub-wallet-customer@example.com', password: PASSWORD });
    expect(createUserRes.status).toBe(201);
    const customerId = createUserRes.body.data.id as string;

    const adjustRes = await request
      .post(`/api/customer/reseller/users/${customerId}/wallet-adjust`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        direction: 'credit',
        amount: '88.50',
        currency: 'CNY',
        reason: 'reseller manual top-up',
        idempotencyKey: 'reseller-adjust-1',
      });
    expect(adjustRes.status).toBe(201);
    expect(adjustRes.body.data).toMatchObject({
      userId: customerId,
      available: '88.5',
      currency: 'CNY',
    });

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { userId: customerId } });
    expect(wallet.tenantId).toBe(ownedTenantId);
    expect(wallet.available.toString()).toBe('88.5');

    const ledger = await prisma.ledger_entries.findUniqueOrThrow({
      where: { idempotencyKey: 'reseller-adjust-1' },
    });
    expect(ledger.walletId).toBe(wallet.id);
    expect(ledger.type).toBe('ADJUSTMENT');
    expect(ledger.amount.toString()).toBe('88.5');
    expect(ledger.reason).toBe('reseller manual top-up');

    const audit = await prisma.audit_logs.findFirstOrThrow({
      where: { action: 'reseller.wallet.adjust', targetId: wallet.id },
    });
    expect(audit.actorType).toBe('USER');
    expect(audit.tenantId).toBe(ownedTenantId);
    expect(audit.reason).toBe('reseller manual top-up');
  });

  it('prevents a reseller from adjusting another sub-site customer wallet', async () => {
    await seedUser(siteId, tenantId, {
      email: 'owner-a@example.com',
      password: PASSWORD,
      currency: 'CNY',
    });
    await seedUser(siteId, tenantId, {
      email: 'owner-b@example.com',
      password: PASSWORD,
      currency: 'CNY',
    });
    const ownerAToken = await loginAs(request, 'owner-a@example.com', PASSWORD, siteId);
    const ownerBToken = await loginAs(request, 'owner-b@example.com', PASSWORD, siteId);

    await request
      .post('/api/tenants/self-service')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ name: 'Owner A Sub-site', code: 'owner-a-wallet' })
      .expect(201);
    await request
      .post('/api/tenants/self-service')
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({ name: 'Owner B Sub-site', code: 'owner-b-wallet' })
      .expect(201);

    const createUserRes = await request
      .post('/api/customer/reseller/users')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ email: 'owner-a-customer@example.com', password: PASSWORD });
    expect(createUserRes.status).toBe(201);
    const customerId = createUserRes.body.data.id as string;

    const denied = await request
      .post(`/api/customer/reseller/users/${customerId}/wallet-adjust`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({
        direction: 'credit',
        amount: '10',
        currency: 'CNY',
        reason: 'cross tenant attempt',
        idempotencyKey: 'cross-tenant-adjust',
      });
    expect(denied.status).toBe(404);

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { userId: customerId } });
    expect(wallet.available.toString()).toBe('0');
    const ledger = await prisma.ledger_entries.findUnique({ where: { idempotencyKey: 'cross-tenant-adjust' } });
    expect(ledger).toBeNull();
  });
});

async function seedMainSiteResource(siteId: string) {
  const resource = await prisma.platform_resources.create({
    data: {
      siteId,
      providerCode: 'IPIPD',
      type: 'ZONE',
      code: 'US:NY-RECOMMENDED',
      name: 'US-New York Recommended',
      displayName: 'US-New York Recommended',
      ipType: 'NATIVE',
      protocol: 'BOTH',
      status: 'ACTIVE',
      isSaleable: true,
      isVisible: true,
      upstreamCost: new Decimal('9.00'),
      upstreamCostCurrency: 'CNY',
    },
  });
  await prisma.inventory_snapshots.create({
    data: {
      siteId,
      resourceId: resource.id,
      providerCode: 'IPIPD',
      stock: 93,
      capturedAt: new Date(),
      freshnessTtlSeconds: 3600,
      isStale: false,
    },
  });
  const defaultTemplate = await prisma.price_templates.create({
    data: { siteId, tenantId: null, name: 'Main Default', isDefault: true },
  });
  await prisma.price_rules.create({
    data: {
      siteId,
      templateId: defaultTemplate.id,
      resourceId: resource.id,
      durationDays: 30,
      unitPrice: new Decimal('18.00'),
      currency: 'CNY',
      minQty: 1,
    },
  });
  return resource;
}
