/**
 * Integration tests proving:
 * 1. API-key scope enforcement on res_static routes (Defect 1)
 * 2. OPERATOR admin is NOT silently promoted to PLATFORM_ADMIN (Defect 2)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  createTestApp,
  cleanDatabase,
  seedApiKey,
  seedSite,
  seedTenant,
  seedUser,
  seedAdminUser,
  seedSession,
  TestRequest,
} from '../../../test-utils/integration-setup';

let app: NestFastifyApplication;
let request: TestRequest;
let siteId: string;
let tenantId: string;
let userId: string;

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
    email: 'scope-test@example.com',
    password: 'pw-12345',
  }));
});

describe('Defect 1: API-key scope enforcement on res_static', () => {
  it('rejects an API key with dedicated:* scope from accessing res_static/business', async () => {
    // Key has dedicated scope but NOT res_static scope
    const { plainKey } = await seedApiKey({
      siteId,
      tenantId,
      ownerId: userId,
      ownerType: 'USER',
      scopes: ['dedicated:catalog:read'],
    });

    const res = await request
      .post('/res_static/business')
      .set('apikey', plainKey)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
    // res_static keeps the legacy envelope: { code, msg, data: null }.
    // The stable reasonKey travels in msg, not data.
    expect(res.body.msg).toBe('insufficient_scope');
    expect(res.body.data).toBeNull();
  });

  it('allows an API key with res_static:* scope to access res_static/business', async () => {
    const { plainKey } = await seedApiKey({
      siteId,
      tenantId,
      ownerId: userId,
      ownerType: 'USER',
      scopes: ['res_static:*'],
    });

    const res = await request
      .post('/res_static/business')
      .set('apikey', plainKey)
      .send({});

    // Should pass scope check (may still fail on business logic but NOT on scope)
    expect(res.status).not.toBe(403);
    if (res.status === 403) {
      expect(res.body.msg).not.toBe('insufficient_scope');
    }
  });

  it('session callers (scopes: []) still pass res_static routes without scope enforcement', async () => {
    // Session tokens have scopes=[] — scope guard must NOT block them.
    const { token } = await seedSession({
      ownerType: 'USER',
      ownerId: userId,
      siteId,
      tenantId,
    });

    const res = await request
      .post('/res_static/business')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // Should NOT be rejected for scope — session callers bypass scope enforcement
    expect(res.status).not.toBe(403);
    if (res.status === 403) {
      expect(res.body.msg).not.toBe('insufficient_scope');
    }
  });
});

describe('Defect 2: OPERATOR admin must NOT be promoted to PLATFORM_ADMIN', () => {
  it('OPERATOR is rejected by a RequirePlatformAdmin route', async () => {
    const operatorId = await seedAdminUser(siteId, null, 'OPERATOR', {
      email: 'operator@example.com',
      password: 'pw-12345',
    });
    const { token } = await seedSession({
      ownerType: 'ADMIN_USER',
      ownerId: operatorId,
      siteId,
      tenantId: null,
    });

    // /api/admin/production-readiness is @RequirePlatformAdmin()
    const res = await request
      .get('/api/admin/production-readiness')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('PLATFORM_ADMIN can still access RequirePlatformAdmin routes', async () => {
    const adminId = await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', {
      email: 'platadmin@example.com',
      password: 'pw-12345',
    });
    const { token } = await seedSession({
      ownerType: 'ADMIN_USER',
      ownerId: adminId,
      siteId,
      tenantId: null,
    });

    const res = await request
      .get('/api/admin/production-readiness')
      .set('Authorization', `Bearer ${token}`);

    // Should NOT be 403
    expect(res.status).not.toBe(403);
  });

  it('OPERATOR can still access operator-level routes (requireOperatorContext)', async () => {
    const operatorId = await seedAdminUser(siteId, null, 'OPERATOR', {
      email: 'operator2@example.com',
      password: 'pw-12345',
    });
    const { token } = await seedSession({
      ownerType: 'ADMIN_USER',
      ownerId: operatorId,
      siteId,
      tenantId: null,
    });

    // /api/admin/control-plane/nodes uses requireOperatorContext
    const res = await request
      .get('/api/admin/control-plane/nodes')
      .set('Authorization', `Bearer ${token}`);

    // Should NOT be 403 — operators should reach operator routes
    expect(res.status).not.toBe(403);
  });
});
