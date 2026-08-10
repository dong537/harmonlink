/**
 * Admin-assisted customer order integration tests.
 *
 * These use the real PostgreSQL test database and verify that admin-assisted
 * static proxy purchases still quote, debit, create orders, enqueue
 * fulfillment, and audit against the target customer as the source of truth.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma } from '@ipeasy/db';
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import {
  createTestApp,
  cleanDatabase,
  seedSite,
  seedTenant,
  seedUser,
  seedAdminUser,
  loginAs,
  TestRequest,
} from '../../../test-utils/integration-setup';

let app: NestFastifyApplication;
let request: TestRequest;

let siteId: string;
let tenantId: string;
let userId: string;

const USER_EMAIL = 'admin-assisted-buyer@example.com';
const USER_PW = 'pw-12345';
const PLATFORM_ADMIN_EMAIL = 'admin-assisted-platform@example.com';
const TENANT_ADMIN_EMAIL = 'admin-assisted-tenant@example.com';
const CURRENCY = 'CNY';

beforeAll(async () => {
  app = await createTestApp();
  request = supertest(app.getHttpServer());
});

afterAll(async () => {
  await cleanDatabase();
  await app?.close();
});

beforeEach(async () => {
  await cleanDatabase();
  siteId = await seedSite();
  tenantId = await seedTenant(siteId);
  ({ userId } = await seedUser(siteId, tenantId, {
    email: USER_EMAIL,
    password: USER_PW,
    currency: CURRENCY,
  }));
});

describe('admin-assisted static proxy order', () => {
  it('platform admin creates a customer order with target wallet debit and audit', async () => {
    const resourceId = await seedSaleableResource({ code: 'JP', unitPrice: '24', durationDays: 30, stock: 100 });
    await prisma.wallets.update({ where: { userId }, data: { available: new Decimal('100') } });
    const adminId = await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', {
      email: PLATFORM_ADMIN_EMAIL,
      password: USER_PW,
    });
    const adminToken = await loginAs(request, PLATFORM_ADMIN_EMAIL, USER_PW, siteId);

    const res = await request
      .post(`/api/orders/users/${userId}/static-proxy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        resourceId,
        quantity: 2,
        durationDays: 30,
        currency: CURRENCY,
        idempotencyKey: 'admin-assisted-platform-1',
        businessType: 'telegram',
        reason: 'customer requested assisted purchase',
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.data.status).toBe('PENDING');

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { userId } });
    expect(wallet.available.toString()).toBe('52');

    const orders = await prisma.orders.findMany({ where: { userId } });
    expect(orders).toHaveLength(1);
    expect(orders[0]!.tenantId).toBe(tenantId);
    expect(orders[0]!.resourceId).toBe(resourceId);
    expect(orders[0]!.totalPrice.toString()).toBe('48');

    const ledger = await prisma.ledger_entries.findMany({ where: { userId, type: 'DEBIT' } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.amount.toString()).toBe('-48');

    const jobs = await prisma.fulfillment_jobs.findMany({ where: { orderId: orders[0]!.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe('QUEUED');

    const audit = await prisma.audit_logs.findMany({
      where: { targetId: orders[0]!.id, action: 'order.admin_create' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorType).toBe('ADMIN_USER');
    expect(audit[0]!.actorId).toBe(adminId);
    expect(audit[0]!.tenantId).toBe(tenantId);
    expect(audit[0]!.reason).toBe('customer requested assisted purchase');
    expect((audit[0]!.meta as Record<string, unknown>)['targetUserId']).toBe(userId);
  });

  it('tenant admin can create an order for a user in the same tenant', async () => {
    const resourceId = await seedSaleableResource({ code: 'HK', unitPrice: '12', durationDays: 30, stock: 100 });
    await prisma.wallets.update({ where: { userId }, data: { available: new Decimal('20') } });
    await seedAdminUser(siteId, tenantId, 'TENANT_ADMIN', {
      email: TENANT_ADMIN_EMAIL,
      password: USER_PW,
    });
    const tenantAdminToken = await loginAs(request, TENANT_ADMIN_EMAIL, USER_PW, siteId);

    const res = await request
      .post(`/api/orders/users/${userId}/static-proxy`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({
        resourceId,
        quantity: 1,
        durationDays: 30,
        currency: CURRENCY,
        idempotencyKey: 'admin-assisted-tenant-own',
        reason: 'tenant support order',
      });

    expect([200, 201]).toContain(res.status);
    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { userId } });
    expect(wallet.available.toString()).toBe('8');
  });

  it('tenant admin cannot create an order for another tenant user', async () => {
    const otherTenantId = await seedTenant(siteId);
    const { userId: otherUserId } = await seedUser(siteId, otherTenantId, {
      email: 'admin-assisted-other@example.com',
      password: USER_PW,
      currency: CURRENCY,
    });
    const resourceId = await seedSaleableResource({ code: 'KR', unitPrice: '10', durationDays: 30, stock: 100 });
    await seedAdminUser(siteId, tenantId, 'TENANT_ADMIN', {
      email: TENANT_ADMIN_EMAIL,
      password: USER_PW,
    });
    const tenantAdminToken = await loginAs(request, TENANT_ADMIN_EMAIL, USER_PW, siteId);

    const res = await request
      .post(`/api/orders/users/${otherUserId}/static-proxy`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({
        resourceId,
        quantity: 1,
        durationDays: 30,
        currency: CURRENCY,
        idempotencyKey: 'admin-assisted-cross-tenant',
        reason: 'not allowed',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_SCOPE_VIOLATION');
    expect(res.body.data.reasonKey).toBe('tenant_access_denied');

    const orders = await prisma.orders.findMany({ where: { userId: otherUserId } });
    expect(orders).toHaveLength(0);
  });

  it('ordinary user cannot call the admin-assisted endpoint', async () => {
    const resourceId = await seedSaleableResource({ code: 'SG', unitPrice: '10', durationDays: 30, stock: 100 });
    const userToken = await loginAs(request, USER_EMAIL, USER_PW, siteId);

    const res = await request
      .post(`/api/orders/users/${userId}/static-proxy`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        resourceId,
        quantity: 1,
        durationDays: 30,
        currency: CURRENCY,
        idempotencyKey: 'admin-assisted-user-denied',
        reason: 'user should not access admin endpoint',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
    expect(res.body.data.reasonKey).toBe('admin_only');

    const orders = await prisma.orders.findMany({ where: { userId } });
    expect(orders).toHaveLength(0);
  });

  it('requires a non-blank reason before mutating wallet or orders', async () => {
    const resourceId = await seedSaleableResource({ code: 'US', unitPrice: '10', durationDays: 30, stock: 100 });
    await prisma.wallets.update({ where: { userId }, data: { available: new Decimal('100') } });
    await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', {
      email: PLATFORM_ADMIN_EMAIL,
      password: USER_PW,
    });
    const adminToken = await loginAs(request, PLATFORM_ADMIN_EMAIL, USER_PW, siteId);

    const res = await request
      .post(`/api/orders/users/${userId}/static-proxy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        resourceId,
        quantity: 1,
        durationDays: 30,
        currency: CURRENCY,
        idempotencyKey: 'admin-assisted-missing-reason',
        reason: '   ',
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.reasonKey).toBe('reason_required');

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { userId } });
    expect(wallet.available.toString()).toBe('100');
    const orders = await prisma.orders.findMany({ where: { userId } });
    expect(orders).toHaveLength(0);
  });

  it('returns the existing order for duplicate idempotency key without a second debit', async () => {
    const resourceId = await seedSaleableResource({ code: 'TW', unitPrice: '24', durationDays: 30, stock: 100 });
    await prisma.wallets.update({ where: { userId }, data: { available: new Decimal('100') } });
    await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', {
      email: PLATFORM_ADMIN_EMAIL,
      password: USER_PW,
    });
    const adminToken = await loginAs(request, PLATFORM_ADMIN_EMAIL, USER_PW, siteId);
    const body = {
      resourceId,
      quantity: 1,
      durationDays: 30,
      currency: CURRENCY,
      idempotencyKey: 'admin-assisted-dup',
      reason: 'duplicate submit retry',
    };

    const res1 = await request
      .post(`/api/orders/users/${userId}/static-proxy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    const res2 = await request
      .post(`/api/orders/users/${userId}/static-proxy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

    expect([200, 201]).toContain(res1.status);
    expect([200, 201]).toContain(res2.status);
    expect(res2.body.data.orderId).toBe(res1.body.data.orderId);

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { userId } });
    expect(wallet.available.toString()).toBe('76');
    const ledger = await prisma.ledger_entries.findMany({ where: { userId, type: 'DEBIT' } });
    expect(ledger).toHaveLength(1);
  });

  it('scopes idempotency key reuse to the target user', async () => {
    const resourceId = await seedSaleableResource({ code: 'MY', unitPrice: '10', durationDays: 30, stock: 100 });
    const { userId: secondUserId } = await seedUser(siteId, tenantId, {
      email: 'admin-assisted-second@example.com',
      password: USER_PW,
      currency: CURRENCY,
    });
    await prisma.wallets.update({ where: { userId }, data: { available: new Decimal('100') } });
    await prisma.wallets.update({ where: { userId: secondUserId }, data: { available: new Decimal('100') } });
    await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', {
      email: PLATFORM_ADMIN_EMAIL,
      password: USER_PW,
    });
    const adminToken = await loginAs(request, PLATFORM_ADMIN_EMAIL, USER_PW, siteId);
    const baseBody = {
      resourceId,
      quantity: 1,
      durationDays: 30,
      currency: CURRENCY,
      idempotencyKey: 'admin-assisted-cross-user-key',
      reason: 'first assisted purchase',
    };

    const first = await request
      .post(`/api/orders/users/${userId}/static-proxy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(baseBody);
    const second = await request
      .post(`/api/orders/users/${secondUserId}/static-proxy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...baseBody, reason: 'same key for a different user' });

    expect([200, 201]).toContain(first.status);
    expect([200, 201]).toContain(second.status);
    expect(second.body.data.orderId).not.toBe(first.body.data.orderId);

    const secondWallet = await prisma.wallets.findUniqueOrThrow({ where: { userId: secondUserId } });
    expect(secondWallet.available.toString()).toBe('90');
    const secondOrders = await prisma.orders.findMany({ where: { userId: secondUserId } });
    expect(secondOrders).toHaveLength(1);
  });
});

async function seedDefaultTemplate(): Promise<string> {
  const template = await prisma.price_templates.create({
    data: { siteId, name: `Default ${randomUUID()}`, isDefault: true },
  });
  return template.id;
}

async function seedSaleableResource(opts: {
  code: string;
  unitPrice: string;
  durationDays: number;
  stock: number;
}): Promise<string> {
  const templateId = await seedDefaultTemplate();
  const resource = await prisma.platform_resources.create({
    data: {
      siteId,
      providerCode: 'IPIPD',
      type: 'COUNTRY',
      code: `${opts.code}-${randomUUID()}`,
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
      providerCode: 'IPIPD',
      stock: opts.stock,
      capturedAt: new Date(),
      freshnessTtlSeconds: 3600,
      isStale: false,
    },
  });
  await prisma.price_rules.create({
    data: {
      siteId,
      templateId,
      resourceId: resource.id,
      durationDays: opts.durationDays,
      unitPrice: new Decimal(opts.unitPrice),
      currency: CURRENCY,
      minQty: 1,
    },
  });
  return resource.id;
}
