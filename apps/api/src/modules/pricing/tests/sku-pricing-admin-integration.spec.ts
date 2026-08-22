/**
 * Dedicated-line SKU pricing admin write APIs.
 *
 * The closed-loop cases are the point of this file: a price written through the
 * admin API must be readable by SkuQuoteUseCase via GET /api/catalog/quote.
 * That is the only assertion that proves the write contract (composite unique
 * key incl. minQty) matches the read contract in catalog.repository.ts.
 */
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import supertest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
} from '../../../test-utils/integration-setup';

const ADMIN_PW = 'SkuPricingAdmin123!';
const USER_PW = 'SkuPricingUser123!';
const ADMIN_EMAIL = 'sku-pricing-admin@example.com';
const USER_EMAIL = 'sku-pricing-user@example.com';

let app: NestFastifyApplication;
let request: TestRequest;
let siteId: string;
let tenantId: string;
let userId: string;
let adminToken: string;
let userToken: string;
let dedicatedSkuId: string;
let residentialSkuId: string;

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
    currency: 'CNY',
  }));
  await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', { email: ADMIN_EMAIL, password: ADMIN_PW });
  adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PW, siteId);
  userToken = await loginAs(request, USER_EMAIL, USER_PW, siteId);

  const dedicated = await prisma.service_skus.create({
    data: {
      siteId,
      code: 'SV',
      name: 'Short Video Dedicated Line',
      capabilities: { delivery: 'dedicated-line', supportedProtocols: ['VLESS'] },
    },
  });
  dedicatedSkuId = dedicated.id;
  const residential = await prisma.service_skus.create({
    data: { siteId, code: 'RES', name: 'Legacy residential', capabilities: { delivery: 'residential' } },
  });
  residentialSkuId = residential.id;
});

async function createSiteDefaultTemplate(name = 'Line pricing'): Promise<string> {
  const res = await request
    .post('/api/pricing/templates')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name, isDefault: true });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

function quoteAsUser(query: { durationDays: number; quantity: number; currency: string }) {
  return request
    .get('/api/catalog/quote')
    .query({ skuCode: 'SV', ...query })
    .set('Authorization', `Bearer ${userToken}`);
}

describe('dedicated-line SKU pricing admin writes', () => {
  it('makes a quote succeed from SITE_DEFAULT_TEMPLATE after writing rules through the admin API', async () => {
    const templateId = await createSiteDefaultTemplate();

    const before = await quoteAsUser({ durationDays: 30, quantity: 1, currency: 'CNY' });
    expect(before.status).toBe(422);
    expect(before.body).toMatchObject({ code: 'PRICE_MISSING', data: { reasonKey: 'no_sku_price_rule' } });

    const write = await request
      .post(`/api/pricing/sku-templates/${templateId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ skuId: dedicatedSkuId, durationDays: 30, unitPrice: '12.50', currency: 'CNY' });
    expect(write.status).toBe(201);

    const after = await quoteAsUser({ durationDays: 30, quantity: 2, currency: 'CNY' });
    expect(after.status).toBe(200);
    expect(after.body.data).toMatchObject({
      skuId: dedicatedSkuId,
      skuCode: 'SV',
      unitPrice: '12.5',
      totalPrice: '25',
      currency: 'CNY',
      priceSource: 'SITE_DEFAULT_TEMPLATE',
    });
  });

  it('makes a quote succeed from SITE_OVERRIDE and outranks the site default template', async () => {
    const templateId = await createSiteDefaultTemplate();
    await request
      .post(`/api/pricing/sku-templates/${templateId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ skuId: dedicatedSkuId, durationDays: 30, unitPrice: '12.50', currency: 'CNY' })
      .expect(201);

    const override = await request
      .post('/api/pricing/sku-overrides')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ skuId: dedicatedSkuId, durationDays: 30, unitPrice: '9.00', currency: 'CNY' });
    expect(override.status).toBe(201);

    const quote = await quoteAsUser({ durationDays: 30, quantity: 1, currency: 'CNY' });
    expect(quote.status).toBe(200);
    expect(quote.body.data).toMatchObject({
      unitPrice: '9',
      totalPrice: '9',
      priceSource: 'SITE_OVERRIDE',
    });
  });

  it('makes a quote succeed from USER_OVERRIDE written through the admin API', async () => {
    const res = await request
      .post('/api/pricing/user-sku-overrides')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tenantId, userId, skuId: dedicatedSkuId, durationDays: 30, unitPrice: '4.25', currency: 'CNY' });
    expect(res.status).toBe(201);

    const quote = await quoteAsUser({ durationDays: 30, quantity: 4, currency: 'CNY' });
    expect(quote.status).toBe(200);
    expect(quote.body.data).toMatchObject({
      unitPrice: '4.25',
      totalPrice: '17',
      priceSource: 'USER_OVERRIDE',
    });
  });

  it('treats minQty as an order-quantity threshold, not the quantity itself', async () => {
    const templateId = await createSiteDefaultTemplate();
    await request
      .post(`/api/pricing/sku-templates/${templateId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ skuId: dedicatedSkuId, durationDays: 30, unitPrice: '7.00', currency: 'CNY', minQty: 5 })
      .expect(201);

    const below = await quoteAsUser({ durationDays: 30, quantity: 3, currency: 'CNY' });
    expect(below.status).toBe(422);
    expect(below.body).toMatchObject({ code: 'PRICE_MISSING', data: { reasonKey: 'no_sku_price_rule' } });

    const atThreshold = await quoteAsUser({ durationDays: 30, quantity: 5, currency: 'CNY' });
    expect(atThreshold.status).toBe(200);
    expect(atThreshold.body.data).toMatchObject({ unitPrice: '7', totalPrice: '35' });
  });

  it('selects the highest matching minQty tier when several tiers are written', async () => {
    const templateId = await createSiteDefaultTemplate();
    await request
      .post(`/api/pricing/sku-templates/${templateId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rules: [
          { skuId: dedicatedSkuId, durationDays: 30, unitPrice: '10.00', currency: 'CNY', minQty: 1 },
          { skuId: dedicatedSkuId, durationDays: 30, unitPrice: '8.00', currency: 'CNY', minQty: 10 },
        ],
      })
      .expect(201);

    const rows = await prisma.sku_price_rules.findMany({ where: { siteId, templateId } });
    expect(rows).toHaveLength(2);

    const small = await quoteAsUser({ durationDays: 30, quantity: 2, currency: 'CNY' });
    expect(small.body.data).toMatchObject({ unitPrice: '10', totalPrice: '20' });

    const bulk = await quoteAsUser({ durationDays: 30, quantity: 10, currency: 'CNY' });
    expect(bulk.body.data).toMatchObject({ unitPrice: '8', totalPrice: '80' });
  });
});

describe('dedicated-line SKU pricing write idempotency', () => {
  it('updates in place instead of inserting a duplicate row for the same composite key', async () => {
    const templateId = await createSiteDefaultTemplate();
    const body = { skuId: dedicatedSkuId, durationDays: 30, unitPrice: '12.00', currency: 'CNY', minQty: 2 };

    await request
      .post('/api/pricing/sku-templates/' + templateId + '/rules')
      .set('Authorization', 'Bearer ' + adminToken)
      .send(body)
      .expect(201);
    await request
      .post('/api/pricing/sku-templates/' + templateId + '/rules')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ ...body, unitPrice: '15.00' })
      .expect(201);

    const rules = await prisma.sku_price_rules.findMany({ where: { siteId, templateId, skuId: dedicatedSkuId } });
    expect(rules).toHaveLength(1);
    expect(rules[0]!.unitPrice.toString()).toBe('15');

    await request
      .post('/api/pricing/sku-overrides')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ skuId: dedicatedSkuId, durationDays: 30, unitPrice: '3.00', currency: 'CNY' })
      .expect(201);
    await request
      .post('/api/pricing/sku-overrides')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ skuId: dedicatedSkuId, durationDays: 30, unitPrice: '5.00', currency: 'CNY' })
      .expect(201);

    const overrides = await prisma.sku_price_overrides.findMany({ where: { siteId, skuId: dedicatedSkuId } });
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.unitPrice.toString()).toBe('5');
  });

  it('lists the rules it wrote through GET /api/pricing/sku-rules', async () => {
    const templateId = await createSiteDefaultTemplate();
    await request
      .post('/api/pricing/sku-templates/' + templateId + '/rules')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ skuId: dedicatedSkuId, durationDays: 30, unitPrice: '11.00', currency: 'CNY' })
      .expect(201);

    const res = await request
      .get('/api/pricing/sku-rules')
      .query({ templateId })
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        skuId: dedicatedSkuId,
        durationDays: 30,
        minQty: 1,
        currency: 'CNY',
        sku: expect.objectContaining({ code: 'SV' }),
      }),
    ]);
  });
});

describe('dedicated-line SKU pricing write rejections', () => {
  it('rejects a SKU that is not delivered as a dedicated line', async () => {
    const templateId = await createSiteDefaultTemplate();
    const res = await request
      .post('/api/pricing/sku-templates/' + templateId + '/rules')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ skuId: residentialSkuId, durationDays: 30, unitPrice: '12.00', currency: 'CNY' });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      data: { reasonKey: 'sku_not_dedicated_line' },
    });
    expect(await prisma.sku_price_rules.count({ where: { siteId } })).toBe(0);
  });

  it('rejects an unknown skuId and a SKU owned by another site', async () => {
    const templateId = await createSiteDefaultTemplate();
    const otherSiteId = await seedSite();
    const foreignSku = await prisma.service_skus.create({
      data: {
        siteId: otherSiteId,
        code: 'SV',
        name: 'Foreign line',
        capabilities: { delivery: 'dedicated-line' },
      },
    });

    const unknown = await request
      .post('/api/pricing/sku-overrides')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ skuId: '00000000-0000-4000-8000-000000000000', durationDays: 30, unitPrice: '1.00', currency: 'CNY' });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({ code: 'NOT_FOUND', data: { reasonKey: 'sku_not_found' } });

    const crossSite = await request
      .post('/api/pricing/sku-templates/' + templateId + '/rules')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ skuId: foreignSku.id, durationDays: 30, unitPrice: '1.00', currency: 'CNY' });
    expect(crossSite.status).toBe(404);
    expect(crossSite.body).toMatchObject({ code: 'NOT_FOUND', data: { reasonKey: 'sku_not_found' } });
  });

  it('rejects a templateId that belongs to another site', async () => {
    const otherSiteId = await seedSite();
    const foreignTemplate = await prisma.price_templates.create({
      data: { siteId: otherSiteId, tenantId: null, name: 'Foreign template', isDefault: true },
    });

    const res = await request
      .post('/api/pricing/sku-templates/' + foreignTemplate.id + '/rules')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ skuId: dedicatedSkuId, durationDays: 30, unitPrice: '12.00', currency: 'CNY' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', data: { reasonKey: 'price_template_not_found' } });
  });

  it('rejects a user override whose user is outside the requested tenant', async () => {
    const otherTenantId = await seedTenant(siteId);
    const { userId: otherUserId } = await seedUser(siteId, otherTenantId, {
      email: 'sku-pricing-other-user@example.com',
      password: USER_PW,
    });

    const res = await request
      .post('/api/pricing/user-sku-overrides')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ tenantId, userId: otherUserId, skuId: dedicatedSkuId, durationDays: 30, unitPrice: '1.00', currency: 'CNY' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', data: { reasonKey: 'user_not_found' } });
    expect(await prisma.user_sku_price_overrides.count({ where: { siteId } })).toBe(0);
  });

  it('rejects invalid unitPrice, durationDays, currency and minQty values', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ unitPrice: '-1' }, 'unit_price_invalid'],
      [{ unitPrice: 'abc' }, 'unit_price_invalid'],
      [{ durationDays: 0 }, 'duration_days_invalid'],
      [{ minQty: 0 }, 'min_qty_invalid'],
      [{ currency: '' }, 'currency_required'],
      [{ skuId: '' }, 'sku_id_required'],
    ];

    for (const [patch, reasonKey] of cases) {
      const res = await request
        .post('/api/pricing/sku-overrides')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({ skuId: dedicatedSkuId, durationDays: 30, unitPrice: '12.00', currency: 'CNY', ...patch });
      expect(res.status, reasonKey).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', data: { reasonKey } });
    }
    expect(await prisma.sku_price_overrides.count({ where: { siteId } })).toBe(0);
  });

  it('denies a customer session on every SKU pricing route', async () => {
    const routes: Array<[string, Record<string, unknown>]> = [
      ['/api/pricing/sku-overrides', { skuId: dedicatedSkuId, durationDays: 30, unitPrice: '1.00', currency: 'CNY' }],
      ['/api/pricing/user-sku-overrides', { tenantId, userId, skuId: dedicatedSkuId, durationDays: 30, unitPrice: '1.00', currency: 'CNY' }],
    ];

    for (const [path, body] of routes) {
      const res = await request.post(path).set('Authorization', 'Bearer ' + userToken).send(body);
      expect(res.status, path).toBe(403);
      expect(res.body).toMatchObject({ code: 'PERMISSION_DENIED', data: { reasonKey: 'insufficient_permissions' } });
    }

    const list = await request.get('/api/pricing/sku-rules').set('Authorization', 'Bearer ' + userToken);
    expect(list.status).toBe(403);
    expect(list.body).toMatchObject({ code: 'PERMISSION_DENIED', data: { reasonKey: 'insufficient_permissions' } });
  });
});
