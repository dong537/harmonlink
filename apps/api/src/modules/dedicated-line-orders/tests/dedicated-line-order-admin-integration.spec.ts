import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma } from '@ipeasy/db';
import { randomUUID } from 'node:crypto';
import {
  cleanDatabase,
  createTestApp,
  loginAs,
  seedAdminUser,
  seedSite,
  seedTenant,
  seedUser,
  TestRequest,
} from '../../../test-utils/integration-setup';

let app: NestFastifyApplication;
let request: TestRequest;
let siteId: string;
let tenantId: string;
let otherTenantId: string;
let userId: string;
let otherUserId: string;
let orderId: string;
let otherOrderId: string;

const PASSWORD = 'admin-dedicated-line-test-password';
const PLATFORM_ADMIN_EMAIL = 'dedicated-line-platform-admin@example.com';
const TENANT_ADMIN_EMAIL = 'dedicated-line-tenant-admin@example.com';
const USER_EMAIL = 'dedicated-line-user@example.com';

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
  otherTenantId = await seedTenant(siteId);
  ({ userId } = await seedUser(siteId, tenantId, { email: USER_EMAIL, password: PASSWORD }));
  ({ userId: otherUserId } = await seedUser(siteId, otherTenantId, {
    email: 'dedicated-line-other-user@example.com',
    password: PASSWORD,
  }));
  orderId = await seedDedicatedOrder(siteId, tenantId, userId, 'primary');
  otherOrderId = await seedDedicatedOrder(siteId, otherTenantId, otherUserId, 'other');
  await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', {
    email: PLATFORM_ADMIN_EMAIL,
    password: PASSWORD,
  });
  await seedAdminUser(siteId, tenantId, 'TENANT_ADMIN', {
    email: TENANT_ADMIN_EMAIL,
    password: PASSWORD,
  });
});

describe('dedicated-line admin orders', () => {
  it('lists the canonical dedicated-line order with job/reservation state and no secret payload', async () => {
    const token = await loginAs(request, PLATFORM_ADMIN_EMAIL, PASSWORD, siteId);

    const response = await request
      .get('/api/admin/dedicated-line-orders?page=1&pageSize=10')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ page: 1, pageSize: 10, total: 2 });
    const item = response.body.data.items.find((entry: { id: string }) => entry.id === orderId);
    expect(item).toMatchObject({
      id: orderId,
      siteId,
      tenantId,
      userId,
      skuCode: 'dedicated-test-primary',
      status: 'FAILED',
      reservation: { status: 'ACTIVE', providerCode: 'IPIPD' },
      job: { status: 'FAILED', lastErrorCode: 'UPSTREAM_FAILED', upstreamOrderId: 'upstream-order-1' },
    });
    expect(JSON.stringify(item)).not.toContain('credentialCiphertext');
    expect(JSON.stringify(item)).not.toContain('payload');
    expect(JSON.stringify(item)).not.toContain('provider-secret');
  });

  it('scopes tenant admin detail to its own tenant', async () => {
    const token = await loginAs(request, TENANT_ADMIN_EMAIL, PASSWORD, siteId);

    const own = await request
      .get(`/api/admin/dedicated-line-orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(own.status).toBe(200);
    expect(own.body.data.id).toBe(orderId);

    const crossTenant = await request
      .get(`/api/admin/dedicated-line-orders/${otherOrderId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.body.code).toBe('NOT_FOUND');
  });

  it('rejects non-admin callers', async () => {
    const token = await loginAs(request, USER_EMAIL, PASSWORD, siteId);

    const response = await request
      .get(`/api/admin/dedicated-line-orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
  });

  it.each([
    ['retry', 'retry'],
    ['retry-fulfillment', 'retry-fulfillment'],
    ['cancel', 'cancel'],
    ['refund', 'refund'],
    ['manual-complete', 'manual-complete'],
  ])('reports %s as an explicit unsupported capability', async (route, operation) => {
    const token = await loginAs(request, PLATFORM_ADMIN_EMAIL, PASSWORD, siteId);

    const response = await request
      .post(`/api/admin/dedicated-line-orders/${orderId}/${route}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'operator request' });

    expect(response.status).toBe(501);
    expect(response.body.code).toBe('UNSUPPORTED_CAPABILITY');
    expect(response.body.data).toMatchObject({
      reasonKey: 'dedicated_line_order_admin_operation_unsupported',
      details: { operation },
    });
  });
});

async function seedDedicatedOrder(
  scopedSiteId: string,
  scopedTenantId: string,
  scopedUserId: string,
  suffix: string,
): Promise<string> {
  const sku = await prisma.service_skus.create({
    data: {
      siteId: scopedSiteId,
      code: `dedicated-test-${suffix}`,
      name: 'Dedicated test SKU',
      capabilities: { dedicatedLine: true },
    },
  });
  const providerAccount = await prisma.provider_accounts.create({
    data: {
      siteId: scopedSiteId,
      tenantId: scopedTenantId,
      providerCode: 'IPIPD',
      status: 'ACTIVE',
      credentialEncrypted: 'provider-secret',
      baseUrl: 'https://provider.example.test',
    },
  });
  const snapshot = await prisma.dedicated_line_inventory_snapshots.create({
    data: {
      siteId: scopedSiteId,
      providerAccountId: providerAccount.id,
      skuId: sku.id,
      providerCode: 'IPIPD',
      countryCode: 'US',
      providerResourceId: `resource-${suffix}`,
      quantity: 10,
      sourceVersion: `snapshot-${suffix}`,
      capturedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const idempotencyKey = `dedicated-admin-${suffix}-${randomUUID()}`;
  const order = await prisma.dedicated_line_orders.create({
    data: {
      siteId: scopedSiteId,
      tenantId: scopedTenantId,
      userId: scopedUserId,
      skuId: sku.id,
      skuCode: sku.code,
      skuName: sku.name,
      countryCode: 'US',
      regionCode: 'NA',
      businessType: 'native',
      durationDays: 30,
      quantity: 1,
      unitPrice: '10',
      totalPrice: '10',
      currency: 'CNY',
      priceSource: 'TEST',
      contractVersion: 1,
      idempotencyKey,
    },
  });
  await prisma.stock_reservations.create({
    data: {
      siteId: scopedSiteId,
      tenantId: scopedTenantId,
      userId: scopedUserId,
      inventorySnapshotId: snapshot.id,
      providerAccountId: providerAccount.id,
      skuId: sku.id,
      dedicatedLineOrderId: order.id,
      providerCode: 'IPIPD',
      countryCode: 'US',
      quantity: 1,
      snapshotVersion: snapshot.sourceVersion,
      status: 'ACTIVE',
      idempotencyKey: `reservation-${suffix}-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  await prisma.external_jobs.create({
    data: {
      siteId: scopedSiteId,
      tenantId: scopedTenantId,
      userId: scopedUserId,
      dedicatedLineOrderId: order.id,
      kind: 'PROVIDER_DEDICATED_LINE_ORDER',
      aggregateType: 'stock_reservation',
      aggregateId: randomUUID(),
      desiredVersion: 1,
      status: 'FAILED',
      attempt: 2,
      maxAttempts: 5,
      nextRunAt: new Date(),
      idempotencyKey: `job-${suffix}-${randomUUID()}`,
      dedupeKey: `job-dedupe-${suffix}-${randomUUID()}`,
      payload: { upstreamOrderId: 'upstream-order-1', credentialCiphertext: 'provider-secret' },
      lastErrorCode: 'UPSTREAM_FAILED',
      lastErrorDetail: { provider: 'untrusted-detail' },
    },
  });
  return order.id;
}
