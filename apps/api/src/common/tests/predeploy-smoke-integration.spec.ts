import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import { prisma } from '@ipeasy/db';
import {
  cleanDatabase,
  createTestApp,
  loginAs,
  seedAdminUser,
  seedSite,
  seedTenant,
  seedUser,
  TestRequest,
} from '../../test-utils/integration-setup';
import { setupSwagger } from '../../modules/openapi/openapi-setup';

let app: NestFastifyApplication;
let request: TestRequest;
let siteId: string;
let tenantId: string;
let userId: string;

const PASSWORD = 'pw-12345';
const ADMIN_EMAIL = 'predeploy-smoke-admin@example.com';
const CUSTOMER_EMAIL = 'predeploy-smoke-customer@example.com';
const CURRENCY = 'CNY';

beforeAll(async () => {
  app = await createTestApp({ beforeInit: setupSwagger });
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
    email: CUSTOMER_EMAIL,
    password: PASSWORD,
    currency: CURRENCY,
  }));
});

describe('predeploy smoke', () => {
  it('covers health, readiness, OpenAPI, login, assisted order, wallet debit, order list, and audit log', async () => {
    const health = await request.get('/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const ready = await request.get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ok');
    expect(ready.body.checks).toEqual({ db: { ok: true }, redis: { ok: true } });

    const openApi = await request.get('/openapi.json');
    expect(openApi.status).toBe(200);
    expect(openApi.body.openapi).toBe('3.0.0');
    expect(openApi.body.paths['/api/orders/users/{userId}/static-proxy']).toBeTruthy();

    const resourceId = await seedSaleableResource({
      code: 'SMOKE',
      unitPrice: '18',
      durationDays: 30,
      stock: 20,
    });
    await prisma.wallets.update({
      where: { userId },
      data: { available: new Decimal('100') },
    });
    const adminId = await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', {
      email: ADMIN_EMAIL,
      password: PASSWORD,
    });

    const token = await loginAs(request, ADMIN_EMAIL, PASSWORD, siteId);

    const order = await request
      .post(`/api/orders/users/${userId}/static-proxy`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        resourceId,
        quantity: 2,
        durationDays: 30,
        currency: CURRENCY,
        idempotencyKey: `predeploy-smoke-${randomUUID()}`,
        businessType: 'smoke',
        reason: 'predeploy assisted order smoke',
      });

    expect([200, 201]).toContain(order.status);
    const orderId = order.body.data.orderId as string;
    expect(order.body.data.status).toBe('PENDING');

    const wallet = await request
      .get(`/api/wallet/${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(wallet.status).toBe(200);
    expect(wallet.body.data.available).toBe('64');
    expect(wallet.body.data.currency).toBe(CURRENCY);

    const orders = await request
      .get('/api/orders')
      .query({ userId, page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`);
    expect(orders.status).toBe(200);
    expect(orders.body.data.total).toBe(1);
    expect(orders.body.data.items[0]).toMatchObject({
      id: orderId,
      userId,
      status: 'PENDING',
      totalPrice: '36',
      currency: CURRENCY,
    });

    const audit = await request
      .get('/api/audit')
      .query({ action: 'order.admin_create', actorType: 'ADMIN_USER' })
      .set('Authorization', `Bearer ${token}`);
    expect(audit.status).toBe(200);
    expect(audit.body.data.items[0]).toMatchObject({
      action: 'order.admin_create',
      actorType: 'ADMIN_USER',
      actorId: adminId,
      targetType: 'orders',
      targetId: orderId,
    });
  });
});

async function seedSaleableResource(opts: {
  code: string;
  unitPrice: string;
  durationDays: number;
  stock: number;
}): Promise<string> {
  const template = await prisma.price_templates.create({
    data: {
      siteId,
      name: `Smoke Default ${randomUUID()}`,
      isDefault: true,
    },
  });
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
      templateId: template.id,
      resourceId: resource.id,
      durationDays: opts.durationDays,
      unitPrice: new Decimal(opts.unitPrice),
      currency: CURRENCY,
      minQty: 1,
    },
  });
  return resource.id;
}
