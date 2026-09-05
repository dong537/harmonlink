/**
 * Auth request-body validation (real DB, real HTTP, real assertions).
 *
 * Regression origin: production `POST /api/auth/login` with `{}` returned 500
 * INTERNAL_ERROR. There is no global ValidationPipe in this API, and `@Body()`
 * DTOs are compile-time only, so an empty body reached
 * `bcrypt.compare(undefined, hash)` which throws a plain Error.
 *
 * The contract these tests pin down:
 *   - malformed/missing body fields  -> 400 VALIDATION_ERROR
 *   - wrong credentials              -> 401 AUTH_REQUIRED / invalid_credentials
 *   - valid credentials              -> 2xx
 *
 * The 400-vs-401 split must never leak account existence: shape errors are
 * about the request, credential errors are uniform for unknown-email and
 * wrong-password alike.
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
  loginAs,
  TestRequest,
} from '../../../test-utils/integration-setup';

let app: NestFastifyApplication;
let request: TestRequest;

let siteId: string;
let tenantId: string;

const EMAIL = 'validation-user@example.com';
const PASSWORD = 'pw-12345678';

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
  await seedUser(siteId, tenantId, { email: EMAIL, password: PASSWORD });
});

describe('POST /api/auth/login body validation', () => {
  it('empty object body returns 400 VALIDATION_ERROR, not 500', async () => {
    const res = await request.post('/api/auth/login').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.reasonKey).toBe('login_email_required');
  });

  it('non-string email and null password return 400', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: 123, password: null, siteId });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.reasonKey).toBe('login_email_required');
  });

  it('valid email with a non-string password returns 400 before bcrypt runs', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: EMAIL, password: { $ne: null }, siteId });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.reasonKey).toBe('login_password_required');
  });

  it('missing siteId returns 400 rather than an unscoped account lookup', async () => {
    const res = await request.post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.reasonKey).toBe('login_site_required');
  });

  it('empty-string fields are rejected as missing', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: '   ', password: '', siteId });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('array body is rejected as a malformed body', async () => {
    const res = await request
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify([{ email: EMAIL, password: PASSWORD, siteId }]));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.reasonKey).toBe('login_body_invalid');
  });

  it('entirely absent body returns a 400 VALIDATION_ERROR envelope', async () => {
    const res = await request.post('/api/auth/login');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('wrong password still returns 401 invalid_credentials, not a 400', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'WRONG-password', siteId });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
    expect(res.body.data.reasonKey).toBe('invalid_credentials');
  });

  it('unknown email is indistinguishable from a wrong password', async () => {
    const unknown = await request
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD, siteId });
    const wrongPassword = await request
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'WRONG-password', siteId });

    expect(unknown.status).toBe(wrongPassword.status);
    expect(unknown.body.code).toBe(wrongPassword.body.code);
    expect(unknown.body.data.reasonKey).toBe(wrongPassword.body.data.reasonKey);
  });

  it('valid credentials still succeed and issue a session', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD, siteId });

    expect([200, 201]).toContain(res.status);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.token.length).toBeGreaterThan(0);
  });

  it('a surrounding-whitespace password is not silently trimmed into a match', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: EMAIL, password: ` ${PASSWORD} `, siteId });

    expect(res.status).toBe(401);
    expect(res.body.data.reasonKey).toBe('invalid_credentials');
  });
});

describe('POST /api/auth/register body validation', () => {
  it('empty object body returns 400 VALIDATION_ERROR', async () => {
    const res = await request.post('/api/auth/register').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.reasonKey).toBe('site_required');
  });

  it('absent body returns 400 and creates no user', async () => {
    const before = await prisma.users.count();
    const res = await request.post('/api/auth/register');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.users.count()).toBe(before);
  });

  it('non-string fields return 400 and create no user', async () => {
    const before = await prisma.users.count();
    const res = await request
      .post('/api/auth/register')
      .send({ email: 123, password: null, siteId });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.reasonKey).toBe('invalid_email');
    expect(await prisma.users.count()).toBe(before);
  });
});

describe('POST /api/auth/change-password body validation', () => {
  it('absent body returns 400 for an authenticated user', async () => {
    const token = await loginAs(request, EMAIL, PASSWORD, siteId);

    const res = await request
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('non-string passwords return 400 and leave the credential unchanged', async () => {
    const token = await loginAs(request, EMAIL, PASSWORD, siteId);
    const before = await prisma.users.findUniqueOrThrow({ where: { siteId_email: { siteId, email: EMAIL } } });

    const res = await request
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: 123, newPassword: null });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    const after = await prisma.users.findUniqueOrThrow({ where: { siteId_email: { siteId, email: EMAIL } } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('unauthenticated change-password is rejected by auth, not by body shape', async () => {
    const res = await request.post('/api/auth/change-password').send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });
});
