/**
 * Per-site identity email uniqueness (real DB, real HTTP registration).
 *
 * The platform runs multiple sites on ONE database (PRD.md 3.2). Identity email
 * must therefore be unique per site, not globally: the same person must be able
 * to hold an account on the main site and on a reseller site, and registration
 * on site A must not be able to reveal that an account exists on site B.
 *
 * These specs pin both halves of that contract, plus the admin_users table which
 * shares the same key shape.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma } from '@ipeasy/db';
import {
  createTestApp,
  cleanDatabase,
  seedSite,
  seedTenant,
  seedUser,
  seedAdminUser,
  TestRequest,
} from '../../../test-utils/integration-setup';

let app: NestFastifyApplication;
let request: TestRequest;

let siteAId: string;
let siteBId: string;
let tenantAId: string;
let tenantBId: string;

const SHARED_EMAIL = 'shared-identity@example.com';
const PASSWORD = 'Customer123!';

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
  siteAId = await seedSite();
  siteBId = await seedSite();
  tenantAId = await seedTenant(siteAId);
  tenantBId = await seedTenant(siteBId);
});

describe('per-site identity email uniqueness', () => {
  it('registers the same email on two different sites', async () => {
    const resA = await request
      .post('/api/auth/register')
      .send({ email: SHARED_EMAIL, password: PASSWORD, siteId: siteAId, tenantId: tenantAId });
    expect([200, 201]).toContain(resA.status);

    const resB = await request
      .post('/api/auth/register')
      .send({ email: SHARED_EMAIL, password: PASSWORD, siteId: siteBId, tenantId: tenantBId });
    expect([200, 201]).toContain(resB.status);

    const rows = await prisma.users.findMany({
      where: { email: SHARED_EMAIL },
      select: { id: true, siteId: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.siteId).sort()).toEqual([siteAId, siteBId].sort());
    expect(rows[0]?.id).not.toBe(rows[1]?.id);
  });

  it('still rejects a duplicate email within the same site', async () => {
    const first = await request
      .post('/api/auth/register')
      .send({ email: SHARED_EMAIL, password: PASSWORD, siteId: siteAId, tenantId: tenantAId });
    expect([200, 201]).toContain(first.status);

    const duplicate = await request
      .post('/api/auth/register')
      .send({ email: SHARED_EMAIL, password: PASSWORD, siteId: siteAId, tenantId: tenantAId });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('VALIDATION_ERROR');
    expect(duplicate.body.data.reasonKey).toBe('email_taken');

    const rows = await prisma.users.findMany({ where: { email: SHARED_EMAIL, siteId: siteAId } });
    expect(rows).toHaveLength(1);
  });

  it('rejects a duplicate email in the same site even when it also exists on another site', async () => {
    await seedUser(siteBId, tenantBId, { email: SHARED_EMAIL, password: PASSWORD });
    await seedUser(siteAId, tenantAId, { email: SHARED_EMAIL, password: PASSWORD });

    const duplicate = await request
      .post('/api/auth/register')
      .send({ email: SHARED_EMAIL, password: PASSWORD, siteId: siteAId, tenantId: tenantAId });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.data.reasonKey).toBe('email_taken');
  });

  it('login on site A cannot authenticate a same-email account that only exists on site B', async () => {
    await seedUser(siteBId, tenantBId, { email: SHARED_EMAIL, password: PASSWORD });

    const res = await request
      .post('/api/auth/login')
      .send({ email: SHARED_EMAIL, password: PASSWORD, siteId: siteAId });

    // Byte-identical to a wrong-password failure, so the response cannot be used
    // to enumerate accounts on another site.
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
    expect(res.body.data.reasonKey).toBe('invalid_credentials');
  });

  it('login resolves the site-local user when the same email exists on both sites', async () => {
    const { userId: userA } = await seedUser(siteAId, tenantAId, { email: SHARED_EMAIL, password: PASSWORD });
    const { userId: userB } = await seedUser(siteBId, tenantBId, { email: SHARED_EMAIL, password: PASSWORD });

    const resA = await request
      .post('/api/auth/login')
      .send({ email: SHARED_EMAIL, password: PASSWORD, siteId: siteAId });
    expect([200, 201]).toContain(resA.status);

    const sessionA = await prisma.sessions.findFirstOrThrow({
      where: { token: { not: '' }, siteId: siteAId },
      orderBy: { createdAt: 'desc' },
    });
    expect(sessionA.ownerId).toBe(userA);
    expect(sessionA.ownerId).not.toBe(userB);
  });

  it('allows the same admin email on two sites and rejects a duplicate within one site', async () => {
    await seedAdminUser(siteAId, tenantAId, 'TENANT_ADMIN', { email: SHARED_EMAIL, password: PASSWORD });
    await seedAdminUser(siteBId, tenantBId, 'TENANT_ADMIN', { email: SHARED_EMAIL, password: PASSWORD });

    const rows = await prisma.admin_users.findMany({
      where: { email: SHARED_EMAIL },
      select: { siteId: true },
    });
    expect(rows).toHaveLength(2);

    await expect(
      seedAdminUser(siteAId, tenantAId, 'TENANT_ADMIN', { email: SHARED_EMAIL, password: PASSWORD }),
    ).rejects.toThrow();
  });

  it('allows a site-global admin and a tenant admin to share an email across sites', async () => {
    await seedAdminUser(siteAId, null, 'PLATFORM_ADMIN', { email: SHARED_EMAIL, password: PASSWORD });
    await seedAdminUser(siteBId, null, 'PLATFORM_ADMIN', { email: SHARED_EMAIL, password: PASSWORD });

    const rows = await prisma.admin_users.findMany({
      where: { email: SHARED_EMAIL },
      select: { siteId: true, tenantId: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.tenantId === null)).toBe(true);
  });
});
