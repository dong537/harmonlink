import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma } from '@ipeasy/db';
import {
  cleanDatabase,
  createTestApp,
  loginAs,
  seedAdminUser,
  seedSite,
  seedTenant,
  TestRequest,
} from '../../../test-utils/integration-setup';

let app: NestFastifyApplication;
let request: TestRequest;
let siteId: string;

const PASSWORD = 'pw-12345';

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
});

async function operatorToken(email: string): Promise<string> {
  await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', { email, password: PASSWORD });
  return loginAs(request, email, PASSWORD, siteId);
}

describe('admin control-plane references', () => {
  it('returns site-scoped node groups and inbound profiles without credentials', async () => {
    const group = await prisma.node_groups.create({
      data: { siteId, code: 'hk-main', name: 'Hong Kong', regionCode: 'HK' },
    });
    await prisma.inbound_profiles.create({
      data: {
        siteId,
        nodeGroupId: group.id,
        code: 'sv-60701',
        protocol: 'VLESS',
        inboundTag: 'sv-main',
        listenPort: 60701,
      },
    });
    await seedAdminUser(siteId, null, 'PLATFORM_ADMIN', {
      email: 'control-plane-admin@example.com',
      password: PASSWORD,
    });
    const token = await loginAs(request, 'control-plane-admin@example.com', PASSWORD, siteId);

    const response = await request
      .get('/api/admin/control-plane/references')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.nodeGroups).toEqual([
      expect.objectContaining({ id: group.id, code: 'hk-main', regionCode: 'HK' }),
    ]);
    expect(response.body.data.inboundProfiles).toEqual([
      expect.objectContaining({ code: 'sv-60701', protocol: 'VLESS', listenPort: 60701 }),
    ]);
    expect(JSON.stringify(response.body.data)).not.toContain('apiCredential');
  });
});

describe('admin control-plane node group creation', () => {
  it('creates a site-scoped node group and exposes it through references', async () => {
    const token = await operatorToken('node-group-create@example.com');

    const response = await request
      .post('/api/admin/control-plane/node-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'hk-main', name: 'Hong Kong Main', regionCode: 'HK' });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({ code: 'hk-main', name: 'Hong Kong Main', regionCode: 'HK', tenantId: null, isActive: true }),
    );

    const stored = await prisma.node_groups.findUniqueOrThrow({ where: { id: response.body.data.id } });
    expect(stored.siteId).toBe(siteId);

    const references = await request
      .get('/api/admin/control-plane/references')
      .set('Authorization', `Bearer ${token}`);
    expect(references.body.data.nodeGroups).toEqual([expect.objectContaining({ id: stored.id, code: 'hk-main' })]);
  });

  it('rejects a duplicate code within the same site with 409', async () => {
    const token = await operatorToken('node-group-dup@example.com');
    await prisma.node_groups.create({ data: { siteId, code: 'hk-main', name: 'Existing', regionCode: 'HK' } });

    const response = await request
      .post('/api/admin/control-plane/node-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'hk-main', name: 'Duplicate', regionCode: 'HK' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await prisma.node_groups.count({ where: { siteId, code: 'hk-main' } })).toBe(1);
  });

  it('rejects a tenant from another site with 404', async () => {
    const token = await operatorToken('node-group-cross-site@example.com');
    const otherSiteId = await seedSite();
    const foreignTenantId = await seedTenant(otherSiteId);

    const response = await request
      .post('/api/admin/control-plane/node-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'hk-main', name: 'Hong Kong Main', regionCode: 'HK', tenantId: foreignTenantId });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(await prisma.node_groups.count({ where: { siteId } })).toBe(0);
  });

  it('rejects a missing region code with 400', async () => {
    const token = await operatorToken('node-group-invalid@example.com');

    const response = await request
      .post('/api/admin/control-plane/node-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'hk-main', name: 'Hong Kong Main' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('denies a non-operator admin with 403', async () => {
    const tenantId = await seedTenant(siteId);
    await seedAdminUser(siteId, tenantId, 'TENANT_ADMIN', {
      email: 'node-group-tenant-admin@example.com',
      password: PASSWORD,
    });
    const token = await loginAs(request, 'node-group-tenant-admin@example.com', PASSWORD, siteId);

    const response = await request
      .post('/api/admin/control-plane/node-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'hk-main', name: 'Hong Kong Main', regionCode: 'HK' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
    expect(await prisma.node_groups.count()).toBe(0);
  });
});

describe('admin control-plane inbound profile creation', () => {
  async function seedGroup(targetSiteId: string, code = 'hk-main'): Promise<string> {
    const group = await prisma.node_groups.create({
      data: { siteId: targetSiteId, code, name: 'Hong Kong Main', regionCode: 'HK' },
    });
    return group.id;
  }

  it('creates a group-scoped inbound profile and exposes it through references', async () => {
    const token = await operatorToken('inbound-create@example.com');
    const nodeGroupId = await seedGroup(siteId);

    const response = await request
      .post('/api/admin/control-plane/inbound-profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({ nodeGroupId, code: 'sv-60701', protocol: 'VLESS', inboundTag: 'sv-main', listenPort: 60701 });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        nodeGroupId, code: 'sv-60701', protocol: 'VLESS', inboundTag: 'sv-main',
        listenPort: 60701, controlNodeId: null, isActive: true,
      }),
    );

    const stored = await prisma.inbound_profiles.findUniqueOrThrow({ where: { id: response.body.data.id } });
    expect(stored.siteId).toBe(siteId);

    const references = await request
      .get('/api/admin/control-plane/references')
      .set('Authorization', `Bearer ${token}`);
    expect(references.body.data.inboundProfiles).toEqual([
      expect.objectContaining({ id: stored.id, nodeGroupId, code: 'sv-60701', listenPort: 60701 }),
    ]);
  });

  it('rejects a node group from another site with 404', async () => {
    const token = await operatorToken('inbound-cross-site@example.com');
    const otherSiteId = await seedSite();
    const foreignGroupId = await seedGroup(otherSiteId);

    const response = await request
      .post('/api/admin/control-plane/inbound-profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({ nodeGroupId: foreignGroupId, code: 'sv-60701', protocol: 'VLESS', inboundTag: 'sv-main', listenPort: 60701 });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(await prisma.inbound_profiles.count()).toBe(0);
  });

  it('rejects a control node belonging to a different node group with 422', async () => {
    const token = await operatorToken('inbound-node-mismatch@example.com');
    const nodeGroupId = await seedGroup(siteId, 'hk-main');
    const otherGroupId = await seedGroup(siteId, 'sg-main');
    const node = await request
      .post('/api/admin/control-plane/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nodeGroupId: otherGroupId, code: 'sg-node-1', name: 'SG Node 1', regionCode: 'SG',
        baseUrl: 'https://sg-node-1.example.com', apiToken: 'node-api-token', capacityUnits: 10,
      });
    expect(node.status).toBe(201);

    const response = await request
      .post('/api/admin/control-plane/inbound-profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nodeGroupId, controlNodeId: node.body.data.id, code: 'sv-60701',
        protocol: 'VLESS', inboundTag: 'sv-main', listenPort: 60701,
      });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.inbound_profiles.count()).toBe(0);
  });

  it('rejects a duplicate code within the same node group with 409', async () => {
    const token = await operatorToken('inbound-dup@example.com');
    const nodeGroupId = await seedGroup(siteId);
    await prisma.inbound_profiles.create({
      data: { siteId, nodeGroupId, code: 'sv-60701', protocol: 'VLESS', inboundTag: 'sv-existing', listenPort: 60701 },
    });

    const response = await request
      .post('/api/admin/control-plane/inbound-profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({ nodeGroupId, code: 'sv-60701', protocol: 'VMESS', inboundTag: 'sv-main', listenPort: 60702 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await prisma.inbound_profiles.count({ where: { siteId, nodeGroupId, code: 'sv-60701' } })).toBe(1);
  });

  it('rejects an invalid protocol and an out-of-range port with 400', async () => {
    const token = await operatorToken('inbound-invalid@example.com');
    const nodeGroupId = await seedGroup(siteId);

    const badProtocol = await request
      .post('/api/admin/control-plane/inbound-profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({ nodeGroupId, code: 'sv-60701', protocol: 'TROJAN', inboundTag: 'sv-main', listenPort: 60701 });
    const badPort = await request
      .post('/api/admin/control-plane/inbound-profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({ nodeGroupId, code: 'sv-60702', protocol: 'VLESS', inboundTag: 'sv-main', listenPort: 70000 });

    expect(badProtocol.status).toBe(400);
    expect(badProtocol.body.code).toBe('VALIDATION_ERROR');
    expect(badPort.status).toBe(400);
    expect(badPort.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.inbound_profiles.count()).toBe(0);
  });

  it('denies a non-operator admin with 403', async () => {
    const nodeGroupId = await seedGroup(siteId);
    const tenantId = await seedTenant(siteId);
    await seedAdminUser(siteId, tenantId, 'TENANT_ADMIN', {
      email: 'inbound-tenant-admin@example.com',
      password: PASSWORD,
    });
    const token = await loginAs(request, 'inbound-tenant-admin@example.com', PASSWORD, siteId);

    const response = await request
      .post('/api/admin/control-plane/inbound-profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({ nodeGroupId, code: 'sv-60701', protocol: 'VLESS', inboundTag: 'sv-main', listenPort: 60701 });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
    expect(await prisma.inbound_profiles.count()).toBe(0);
  });
});
