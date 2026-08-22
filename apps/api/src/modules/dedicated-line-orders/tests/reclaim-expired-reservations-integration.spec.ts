/**
 * Runs against a REAL PostgreSQL test database.
 *
 * The unit spec covers the use-case decision table with fakes. This spec exists
 * for the invariants only a real database can prove: the ACTIVE guard under a
 * concurrent second reclaim, the ledger idempotency key that stops a double
 * refund, and the single-transaction coupling of reservation status, inventory
 * counter, wallet balance and job terminal state.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LedgerEntryType, prisma } from '@ipeasy/db';
import { cleanDatabase, seedSite, seedTenant, seedUser } from '../../../test-utils/integration-setup';
import { WalletRepository } from '../../wallet/wallet.repository';
import { ReclaimExpiredReservationsRepository } from '../reclaim-expired-reservations.repository';
import { ReclaimExpiredReservationsUseCase } from '../domain';

type JobStatus = 'QUEUED' | 'LEASED' | 'RETRYING' | 'COMPLETED' | 'FAILED' | 'NEEDS_OPERATOR';

const ORDER_JOB_KIND = 'PROVIDER_DEDICATED_LINE_ORDER';
const CHARGED = '48';
const EXPIRED_AT = new Date('2026-08-22T00:10:00Z');
const NOW = new Date('2026-08-22T01:00:00Z');

let repo: ReclaimExpiredReservationsRepository;
let useCase: ReclaimExpiredReservationsUseCase;

type Scope = {
  siteId: string;
  walletId: string;
  snapshotId: string;
  reservationId: string;
  jobId: string;
};

beforeAll(() => {
  repo = new ReclaimExpiredReservationsRepository(new WalletRepository());
  useCase = new ReclaimExpiredReservationsUseCase(repo);
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await cleanDatabase();
});

let seq = 0;

/** An expired ACTIVE reservation, charged, whose purchase job never ran. */
async function seedExpiredReservation(job?: { status?: JobStatus; attempt?: number }): Promise<Scope> {
  seq += 1;
  const siteId = await seedSite();
  const tenantId = await seedTenant(siteId);
  const { userId, walletId } = await seedUser(siteId, tenantId, {
    email: `reclaim-${seq}-${Date.now()}@example.com`,
    password: 'pw-reclaim-1',
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

  const sku = await prisma.service_skus.create({
    data: { siteId, code: `SV-${seq}`, name: 'Shared VLESS', capabilities: { delivery: 'dedicated-line' } },
  });

  const snapshot = await prisma.dedicated_line_inventory_snapshots.create({
    data: {
      siteId,
      providerAccountId: account.id,
      skuId: sku.id,
      providerCode: 'OPENUI',
      countryCode: 'HK',
      providerResourceId: 'upstream-sv-hk',
      quantity: 10,
      reservedQuantity: 2,
      sourceVersion: 'v1',
      capturedAt: new Date('2026-08-22T00:00:00Z'),
      expiresAt: new Date('2026-08-23T00:00:00Z'),
    },
  });

  const reservation = await prisma.stock_reservations.create({
    data: {
      siteId,
      tenantId,
      userId,
      inventorySnapshotId: snapshot.id,
      providerAccountId: account.id,
      skuId: sku.id,
      providerCode: 'OPENUI',
      countryCode: 'HK',
      quantity: 2,
      snapshotVersion: 'v1',
      status: 'ACTIVE',
      idempotencyKey: `order-key-${seq}`,
      expiresAt: EXPIRED_AT,
    },
  });

  // The debit the reclaim has to refund.
  await prisma.ledger_entries.create({
    data: {
      siteId,
      tenantId,
      walletId,
      userId,
      type: LedgerEntryType.DEBIT,
      amount: `-${CHARGED}`,
      balanceAfter: '0',
      currency: 'CNY',
      relatedId: reservation.id,
      reason: 'dedicated_line_order_charge',
      idempotencyKey: `dedicated_line_order:order-key-${seq}`,
    },
  });

  const created = await prisma.external_jobs.create({
    data: {
      siteId,
      kind: ORDER_JOB_KIND,
      aggregateType: 'stock_reservation',
      aggregateId: reservation.id,
      desiredVersion: 1,
      status: job?.status ?? 'QUEUED',
      attempt: job?.attempt ?? 0,
      idempotencyKey: `dedicated-line-order:order-key-${seq}`,
      dedupeKey: `dedicated-line-order:order-key-${seq}`,
      payload: {},
      nextRunAt: new Date('2026-08-22T00:00:00Z'),
    },
  });

  return { siteId, walletId, snapshotId: snapshot.id, reservationId: reservation.id, jobId: created.id };
}

function refundsFor(reservationId: string) {
  return prisma.ledger_entries.findMany({ where: { relatedId: reservationId, type: LedgerEntryType.REFUND } });
}

describe('ReclaimExpiredReservations (real database)', () => {
  it('returns stock, refunds the debit and terminates the job together', async () => {
    const scope = await seedExpiredReservation();

    expect(await useCase.execute(NOW)).toEqual({ scanned: 1, reclaimed: 1, skippedIssued: 0 });

    const reservation = await prisma.stock_reservations.findUniqueOrThrow({ where: { id: scope.reservationId } });
    expect(reservation.status).toBe('EXPIRED');
    expect(reservation.releasedAt).toEqual(NOW);

    const snapshot = await prisma.dedicated_line_inventory_snapshots.findUniqueOrThrow({ where: { id: scope.snapshotId } });
    expect(snapshot.reservedQuantity).toBe(0);

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { id: scope.walletId } });
    expect(Number(wallet.available)).toBe(48);

    const refund = await prisma.ledger_entries.findUniqueOrThrow({
      where: { idempotencyKey: `dedicated-line-refund:${scope.reservationId}` },
    });
    expect(Number(refund.amount)).toBe(48);

    const job = await prisma.external_jobs.findUniqueOrThrow({ where: { id: scope.jobId } });
    expect(job.status).toBe('FAILED');
    expect(job.lastErrorCode).toBe('STOCK_RESERVATION_EXPIRED');
  });

  it('refunds once when the reclaim sweep runs twice', async () => {
    const scope = await seedExpiredReservation();

    expect((await useCase.execute(NOW)).reclaimed).toBe(1);
    // Already EXPIRED, so it is no longer a candidate at all.
    expect(await useCase.execute(new Date('2026-08-22T02:00:00Z'))).toEqual({ scanned: 0, reclaimed: 0, skippedIssued: 0 });

    expect(await refundsFor(scope.reservationId)).toHaveLength(1);
    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { id: scope.walletId } });
    expect(Number(wallet.available)).toBe(48);
  });

  // Drives reclaim() directly instead of the sweep, because an EXPIRED
  // reservation is filtered out before it reaches the transaction. Only this
  // path exercises the ACTIVE guard that stops a second refund.
  it('refuses a second reclaim of the same reservation, so stock and money move once', async () => {
    const scope = await seedExpiredReservation();
    const [candidate] = await repo.findExpiredCandidates(NOW, 10);

    expect(await repo.reclaim(candidate!, NOW)).toBe(true);
    expect(await repo.reclaim(candidate!, NOW)).toBe(false);

    expect(await refundsFor(scope.reservationId)).toHaveLength(1);
    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { id: scope.walletId } });
    expect(Number(wallet.available)).toBe(48);
    const snapshot = await prisma.dedicated_line_inventory_snapshots.findUniqueOrThrow({ where: { id: scope.snapshotId } });
    expect(snapshot.reservedQuantity).toBe(0);
  });

  it('moves stock and money once when two reclaims race the same reservation', async () => {
    const scope = await seedExpiredReservation();
    const candidate = { reservationId: scope.reservationId, siteId: scope.siteId, quantity: 2, jobId: scope.jobId, neverIssued: true };

    const settled = await Promise.allSettled([repo.reclaim(candidate, NOW), repo.reclaim(candidate, NOW)]);

    // One transaction wins. The loser either observes the non-ACTIVE status and
    // returns false, or is rolled back by the ledger unique constraint. Either
    // way stock and money move exactly once.
    const wins = settled.filter((r) => r.status === 'fulfilled' && r.value === true);
    expect(wins).toHaveLength(1);

    const snapshot = await prisma.dedicated_line_inventory_snapshots.findUniqueOrThrow({ where: { id: scope.snapshotId } });
    expect(snapshot.reservedQuantity).toBe(0);
    expect(await refundsFor(scope.reservationId)).toHaveLength(1);

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { id: scope.walletId } });
    expect(Number(wallet.available)).toBe(48);
  });

  it('leaves a reservation whose job already ran untouched, so a paid order is never refunded', async () => {
    const scope = await seedExpiredReservation({ status: 'LEASED', attempt: 1 });

    expect(await useCase.execute(NOW)).toEqual({ scanned: 1, reclaimed: 0, skippedIssued: 1 });

    const reservation = await prisma.stock_reservations.findUniqueOrThrow({ where: { id: scope.reservationId } });
    expect(reservation.status).toBe('ACTIVE');

    const snapshot = await prisma.dedicated_line_inventory_snapshots.findUniqueOrThrow({ where: { id: scope.snapshotId } });
    expect(snapshot.reservedQuantity).toBe(2);

    const wallet = await prisma.wallets.findUniqueOrThrow({ where: { id: scope.walletId } });
    expect(Number(wallet.available)).toBe(0);
    expect(await refundsFor(scope.reservationId)).toHaveLength(0);
  });
});
