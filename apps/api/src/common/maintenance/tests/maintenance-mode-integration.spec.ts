import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma } from '@ipeasy/db';
import {
  cleanDatabase,
  createTestApp,
  loginAs,
  seedAdminUser,
  seedSite,
  TestRequest,
} from '../../../test-utils/integration-setup';

/**
 * Maintenance mode is per-site. This platform runs many sites (one `sites` row
 * per 分站), so these specs seed TWO sites with different domains and different
 * creation order, then assert the blocked traffic is scoped to the site whose
 * Host header was sent.
 *
 * GATED_PATH is the probe route: a real route that is NOT in the maintenance
 * bypass list. The maintenance middleware runs before AuthGuard, so a gated
 * site answers 503 here before auth is ever considered; when the site is open
 * the same request falls through to the guard and answers 401. That 503-vs-401
 * split is exactly what these tests need, and it keeps the assertions off the
 * bypassed `/api/sites/current` prefix.
 */
const GATED_PATH = '/api/catalog/skus';
const OPEN_STATUS = 401;
let app: NestFastifyApplication;
let request: TestRequest;

let oldestSiteId: string;
let oldestSiteDomain: string;
let newerSiteId: string;
let newerSiteDomain: string;

const ADMIN_PASSWORD = 'maintenance-admin-password';
const MAINTENANCE_MESSAGE = '站点维护中，请稍后再试';

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
  oldestSiteId = await seedSite();
  newerSiteId = await seedSite();
  const [oldest, newer] = await Promise.all([
    prisma.sites.findUniqueOrThrow({ where: { id: oldestSiteId } }),
    prisma.sites.findUniqueOrThrow({ where: { id: newerSiteId } }),
  ]);
  // seedSite() generates unique domains and increasing createdAt, so the first
  // seeded row is the one the site-resolution fallback would pick.
  expect(oldest.createdAt.getTime()).toBeLessThanOrEqual(newer.createdAt.getTime());
  oldestSiteDomain = oldest.domain;
  newerSiteDomain = newer.domain;
});

async function enableMaintenance(siteId: string): Promise<void> {
  await prisma.sites.update({
    where: { id: siteId },
    data: { maintenanceMode: true, maintenanceMessage: MAINTENANCE_MESSAGE },
  });
}

describe('site maintenance mode is scoped to the requested host', () => {
  it('blocks only the site that is actually in maintenance', async () => {
    await enableMaintenance(newerSiteId);

    const blocked = await request
      .get(GATED_PATH)
      .set('Host', newerSiteDomain);
    expect(blocked.status).toBe(503);
    expect(blocked.body.code).toBe('UPSTREAM_DISABLED');
    expect(blocked.body.data.reasonKey).toBe('site_maintenance');
    expect(blocked.body.msg).toBe(MAINTENANCE_MESSAGE);

    const untouched = await request
      .get(GATED_PATH)
      .set('Host', oldestSiteDomain);
    expect(untouched.status).toBe(OPEN_STATUS);
  });

  it('does not take down another site when the oldest site is in maintenance', async () => {
    await enableMaintenance(oldestSiteId);

    const blocked = await request
      .get(GATED_PATH)
      .set('Host', oldestSiteDomain);
    expect(blocked.status).toBe(503);

    const other = await request
      .get(GATED_PATH)
      .set('Host', newerSiteDomain);
    expect(other.status).toBe(OPEN_STATUS);
  });

  it('falls back to the oldest active site for an unknown host, like public resolution does', async () => {
    await enableMaintenance(oldestSiteId);

    // SitesRepository.resolvePublicContext() resolves an unrecognized host to the
    // oldest ACTIVE site. The maintenance gate must agree, otherwise an unknown
    // Host header is a way to keep browsing a site that is closed.
    const unknownHost = await request
      .get(GATED_PATH)
      .set('Host', 'not-a-configured-domain.example.com');
    expect(unknownHost.status).toBe(503);
    expect(unknownHost.body.data.reasonKey).toBe('site_maintenance');
  });

  it('blocks a reseller custom domain that maps to the site in maintenance', async () => {
    await prisma.tenants.create({
      data: {
        siteId: newerSiteId,
        code: `reseller_${Date.now()}`,
        name: 'Reseller',
        status: 'ACTIVE',
        brandConfig: { customDomain: 'reseller.example.com' },
      },
    });
    await enableMaintenance(newerSiteId);

    const viaResellerDomain = await request
      .get(GATED_PATH)
      .set('Host', 'reseller.example.com');
    expect(viaResellerDomain.status).toBe(503);
    expect(viaResellerDomain.body.data.reasonKey).toBe('site_maintenance');
  });

  it('resolves the site through x-public-host before Host', async () => {
    await enableMaintenance(newerSiteId);

    const forwarded = await request
      .get(GATED_PATH)
      .set('Host', oldestSiteDomain)
      .set('x-public-host', `${newerSiteDomain}:443`);
    expect(forwarded.status).toBe(503);
    expect(forwarded.body.data.reasonKey).toBe('site_maintenance');
  });
});

describe('bypass paths stay reachable during maintenance', () => {
  it('allows login so an operator can obtain a token for the blocked site', async () => {
    const email = 'maintenance-login-admin@example.com';
    await seedAdminUser(newerSiteId, null, 'PLATFORM_ADMIN', { email, password: ADMIN_PASSWORD });
    await enableMaintenance(newerSiteId);

    const login = await request
      .post('/api/auth/login')
      .set('Host', newerSiteDomain)
      .send({ email, password: ADMIN_PASSWORD, siteId: newerSiteId });

    expect(login.status).toBe(201);
    expect(login.body.data.token).toEqual(expect.any(String));
  });

  it('allows the public site context so the maintenance page can render branding', async () => {
    await enableMaintenance(newerSiteId);

    const context = await request.get('/api/sites/current').set('Host', newerSiteDomain);
    expect(context.status).toBe(200);
    expect(context.body.data.site.id).toBe(newerSiteId);
  });

  it('keeps /health outside the maintenance gate', async () => {
    await enableMaintenance(oldestSiteId);
    await enableMaintenance(newerSiteId);

    const health = await request.get('/health');
    expect(health.status).toBe(200);
  });
});

describe('platform admin bypass during maintenance', () => {
  it('lets a platform admin reach the maintenance toggle and turn it back off', async () => {
    const email = 'maintenance-platform-admin@example.com';
    await seedAdminUser(newerSiteId, null, 'PLATFORM_ADMIN', { email, password: ADMIN_PASSWORD });
    const token = await loginAs(request, email, ADMIN_PASSWORD, newerSiteId);
    await enableMaintenance(newerSiteId);

    const disable = await request
      .put('/api/sites/current/maintenance')
      .set('Host', newerSiteDomain)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false });

    expect(disable.status).toBe(200);
    const site = await prisma.sites.findUniqueOrThrow({ where: { id: newerSiteId } });
    expect(site.maintenanceMode).toBe(false);

    const reopened = await request
      .get(GATED_PATH)
      .set('Host', newerSiteDomain);
    expect(reopened.status).toBe(OPEN_STATUS);
  });

  it('still blocks a non-admin session on the site in maintenance', async () => {
    const email = 'maintenance-tenant-admin@example.com';
    const tenant = await prisma.tenants.create({
      data: { siteId: newerSiteId, code: `t_${Date.now()}`, name: 'T', status: 'ACTIVE' },
    });
    await seedAdminUser(newerSiteId, tenant.id, 'TENANT_ADMIN', { email, password: ADMIN_PASSWORD });
    const token = await loginAs(request, email, ADMIN_PASSWORD, newerSiteId);
    await enableMaintenance(newerSiteId);

    const response = await request
      .get('/api/tenants')
      .set('Host', newerSiteDomain)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(503);
    expect(response.body.data.reasonKey).toBe('site_maintenance');
  });
});
