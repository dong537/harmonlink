/**
 * End-to-end dedicated-line ordering against a REAL PostgreSQL database,
 * driven through the real HTTP route and real auth.
 *
 * The unit specs cover the use-case decision table with fakes. This spec exists
 * for what only a real database can prove: `reserveAndEnqueue` commits stock
 * decrement, order, reservation, wallet debit and job enqueue in ONE
 * transaction, and rolls all five back together when any one of them fails.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import Decimal from 'decimal.js';
import { prisma } from '@ipeasy/db';
import {
  cleanDatabase,
  createTestApp,
  loginAs,
  seedSite,
  seedTenant,
  seedUser,
  TestRequest,
} from '../../../test-utils/integration-setup';

const ORDER_JOB_KIND = 'PROVIDER_DEDICATED_LINE_ORDER';
const EMAIL = 'dl-order@example.com';
const PASSWORD = 'pw-dl-order-1';
const UNIT_PRICE = '12.50';
const TOPUP = '500';

let app: NestFastifyApplication;
let request: TestRequest;

type Scope = {
  siteId: string;
  tenantId: string;
  userId: string;
  walletId: string;
  skuId: string;
  snapshotId: string;
  token: string;
};

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
});

/** A site fully configured to sell one dedicated-line SKU in HK. */
async function seedSellableLine(opts?: { available?: number; balance?: string }): Promise<Scope> {
  const siteId = await seedSite();
  const tenantId = await seedTenant(siteId);
  const { userId, walletId } = await seedUser(siteId, tenantId, { email: EMAIL, password: PASSWORD });

  await prisma.wallets.update({
    where: { id: walletId },
    data: { available: opts?.balance ?? TOPUP },
  });

  const sku = await prisma.service_skus.create({
    data: {
      siteId,
      code: 'SV',
      name: 'Shared VLESS',
      capabilities: { delivery: 'dedicated-line', supportedProtocols: ['VLESS'] },
    },
  });

  const template = await prisma.price_templates.create({
    data: { siteId, tenantId: null, name: 'Default line pricing', isDefault: true },
  });
  await prisma.sku_price_rules.create({
    data: {
      siteId,
      templateId: template.id,
      skuId: sku.id,
      durationDays: 30,
      minQty: 1,
      unitPrice: new Decimal(UNIT_PRICE),
      currency: 'CNY',
    },
  });

  const account = await prisma.provider_accounts.create({
    data: {
      siteId,
      providerCode: 'OPENUI',
      status: 'ACTIVE',
      credentialEncrypted: 'test-ciphertext',
      baseUrl: 'https://upstream.invalid',
    },
  });

  const snapshot = await prisma.dedicated_line_inventory_snapshots.create({
    data: {
      siteId,
      providerAccountId: account.id,
      skuId: sku.id,
      providerCode: 'OPENUI',
      countryCode: 'HK',
      providerResourceId: 'upstream-sv-hk',
      quantity: opts?.available ?? 10,
      reservedQuantity: 0,
      sourceVersion: 'v1',
      capturedAt: new Date('2026-08-22T00:00:00Z'),
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    },
  });

  const group = await prisma.node_groups.create({
    data: { siteId, code: 'hk-1', name: 'HK group', regionCode: 'HK' },
  });
  const node = await prisma.control_nodes.create({
    data: {
      siteId,
      nodeGroupId: group.id,
      code: 'hk-node-1',
      name: 'HK node 1',
      regionCode: 'HK',
      baseUrl: 'https://node.invalid',
      apiCredentialCiphertext: 'test-ciphertext',
      apiCredentialFingerprint: 'test-fingerprint',
      status: 'ACTIVE',
      capacityUnits: 100,
      allocatedUnits: 0,
    },
  });
  const profile = await prisma.inbound_profiles.create({
    data: {
      siteId,
      nodeGroupId: group.id,
      code: 'in-hk-1',
      protocol: 'VLESS',
      inboundTag: 'in-hk-1',
      listenPort: 443,
      isActive: true,
    },
  });
  const policy = await prisma.line_placement_policies.create({
    data: {
      siteId,
      nodeGroupId: group.id,
      inboundProfileId: profile.id,
      targetReplicaCount: 1,
      minReadyReplicaCount: 1,
      maxUnitsPerNode: 10,
      priority: 100,
      isActive: true,
    },
  });
  await prisma.line_placement_policy_nodes.create({
    data: { siteId, policyId: policy.id, nodeId: node.id },
  });

  const token = await loginAs(request, EMAIL, PASSWORD, siteId);
  return { siteId, tenantId, userId, walletId, skuId: sku.id, snapshotId: snapshot.id, token };
}

function placeOrder(scope: Scope, body: Record<string, unknown>) {
  return request
    .post('/api/dedicated-line-orders')
    .set('Authorization', `Bearer ${scope.token}`)
    .set('x-site-id', scope.siteId)
    .send(body);
}

const validOrder = {
  skuCode: 'SV',
  quantity: 2,
  durationDays: 30,
  countryCode: 'HK',
  currency: 'CNY',
  idempotencyKey: 'order-key-1',
};

describe('CreateDedicatedLineOrder (real database, real HTTP)', () => {
  it('commits stock, order, reservation, wallet debit and job in one transaction', async () => {
    const scope = await seedSellableLine();

    const response = await placeOrder(scope, validOrder);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      skuCode: 'SV',
      countryCode: 'HK',
      quantity: 2,
      unitPrice: '12.5',
      totalPrice: '25',
      currency: 'CNY',
      replayed: false,
    });

    const orderId = response.body.data.orderId as string;
    const reservationId = response.body.data.reservationId as string;

    const snapshot = await prisma.dedicated_line_inventory_snapshots.findUniqueOrThrow({
      where: { id: scope.snapshotId },
    });
    expect(snapshot.reservedQuantity).toBe(2);

    const order = await prisma.dedicated_line_orders.findUniqueOrThrow({ where: { id: orderId } });
    expect(Number(order.totalPrice)).toBe(25);
    expect(order.quantity).toBe(2);

    const reservation = await prisma.stock_reservations.findUniqueOrThrow({ where: { id: reservationId } });
    expect(reservation.status).toBe('ACTIVE');
    expect(reservation.dedicatedLineOrderId).toBe(orderId);

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { id: scope.walletId } });
    expect(Number(wallet.available)).toBe(475);

    const job = await prisma.external_jobs.findFirstOrThrow({
      where: { aggregateId: reservationId, kind: ORDER_JOB_KIND },
    });
    expect(job.status).toBe('QUEUED');
    expect(job.attempt).toBe(0);
    // The worker reads providerResourceId from the route snapshot, not the caller.
    const payload = job.payload as Record<string, unknown>;
    const jobRequest = payload['request'] as Record<string, unknown>;
    expect(jobRequest['providerResourceId']).toBe('upstream-sv-hk');
  });

  it('replays the same order for a repeated idempotency key instead of charging twice', async () => {
    const scope = await seedSellableLine();

    const first = await placeOrder(scope, validOrder);
    const second = await placeOrder(scope, validOrder);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.replayed).toBe(true);
    expect(second.body.data.orderId).toBe(first.body.data.orderId);
    expect(second.body.data.reservationId).toBe(first.body.data.reservationId);

    expect(await prisma.dedicated_line_orders.count({ where: { siteId: scope.siteId } })).toBe(1);
    expect(await prisma.external_jobs.count({ where: { kind: ORDER_JOB_KIND } })).toBe(1);

    const snapshot = await prisma.dedicated_line_inventory_snapshots.findUniqueOrThrow({
      where: { id: scope.snapshotId },
    });
    expect(snapshot.reservedQuantity).toBe(2);

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { id: scope.walletId } });
    expect(Number(wallet.available)).toBe(475);
  });

  it('rolls stock and order back when the wallet cannot cover the charge', async () => {
    const scope = await seedSellableLine({ balance: '10' });

    const response = await placeOrder(scope, validOrder);

    expect(response.status).toBeGreaterThanOrEqual(400);

    // Every write in the transaction must be gone, not just the debit.
    const snapshot = await prisma.dedicated_line_inventory_snapshots.findUniqueOrThrow({
      where: { id: scope.snapshotId },
    });
    expect(snapshot.reservedQuantity).toBe(0);
    expect(await prisma.dedicated_line_orders.count({ where: { siteId: scope.siteId } })).toBe(0);
    expect(await prisma.stock_reservations.count({ where: { siteId: scope.siteId } })).toBe(0);
    expect(await prisma.external_jobs.count({ where: { kind: ORDER_JOB_KIND } })).toBe(0);

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { id: scope.walletId } });
    expect(Number(wallet.available)).toBe(10);
  });

  it('refuses to oversell when demand exceeds the fresh snapshot', async () => {
    const scope = await seedSellableLine({ available: 1 });

    const response = await placeOrder(scope, validOrder);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('UPSTREAM_OUT_OF_STOCK');
    expect(response.body.data?.reasonKey).toBe('dedicated_line_inventory_insufficient');

    const snapshot = await prisma.dedicated_line_inventory_snapshots.findUniqueOrThrow({
      where: { id: scope.snapshotId },
    });
    expect(snapshot.reservedQuantity).toBe(0);
    expect(await prisma.external_jobs.count({ where: { kind: ORDER_JOB_KIND } })).toBe(0);

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { id: scope.walletId } });
    expect(Number(wallet.available)).toBe(500);
  });

  it('moves stock and money once when two identical orders race', async () => {
    const scope = await seedSellableLine();

    const [first, second] = await Promise.all([
      placeOrder(scope, validOrder),
      placeOrder(scope, validOrder),
    ]);

    // Both may succeed (one is a replay), but the side effects happen once.
    expect([first.status, second.status].filter((status) => status === 201).length).toBeGreaterThan(0);

    expect(await prisma.dedicated_line_orders.count({ where: { siteId: scope.siteId } })).toBe(1);
    expect(await prisma.external_jobs.count({ where: { kind: ORDER_JOB_KIND } })).toBe(1);

    const snapshot = await prisma.dedicated_line_inventory_snapshots.findUniqueOrThrow({
      where: { id: scope.snapshotId },
    });
    expect(snapshot.reservedQuantity).toBe(2);

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { id: scope.walletId } });
    expect(Number(wallet.available)).toBe(475);
  });
});
