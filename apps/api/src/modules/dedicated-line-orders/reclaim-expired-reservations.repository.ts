import { Injectable } from '@nestjs/common';
import { prisma } from '@ipeasy/db';
import { WalletRepository } from '../wallet/wallet.repository';
import { refundReservationTx, releaseReservationTx } from './dedicated-line-order.repository';
import type { ExpiredReservationCandidate, ExpiredReservationSource } from './domain';

const ORDER_JOB_KIND = 'PROVIDER_DEDICATED_LINE_ORDER';

@Injectable()
export class ReclaimExpiredReservationsRepository implements ExpiredReservationSource {
  constructor(private readonly wallets: WalletRepository) {}

  // Candidates are reservations whose purchase job was never executed. `attempt`
  // is incremented by claimRunnableJob, and a crashed worker leaves the job in
  // NEEDS_OPERATOR rather than back in QUEUED, so `attempt = 0 AND status =
  // QUEUED` proves the upstream provider was never contacted for this order.
  async findExpiredCandidates(now: Date, limit: number): Promise<ExpiredReservationCandidate[]> {
    const rows = await prisma.stock_reservations.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: now },
      },
      select: { id: true, siteId: true, quantity: true, expiresAt: true },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    if (rows.length === 0) return [];

    const jobs = await prisma.external_jobs.findMany({
      where: {
        kind: ORDER_JOB_KIND,
        aggregateType: 'stock_reservation',
        aggregateId: { in: rows.map((row) => row.id) },
      },
      select: { id: true, siteId: true, aggregateId: true, attempt: true, status: true },
    });
    const jobByReservation = new Map(jobs.map((job) => [job.aggregateId, job]));

    return rows.map((row) => {
      const job = jobByReservation.get(row.id);
      return {
        reservationId: row.id,
        siteId: row.siteId,
        quantity: row.quantity,
        jobId: job?.id ?? null,
        // A missing job is never reclaimable: without it we cannot prove the
        // upstream provider was not contacted.
        neverIssued: job ? job.attempt === 0 && job.status === 'QUEUED' && job.siteId === row.siteId : false,
      };
    });
  }

  // Single transaction so the reservation status, the inventory counter, the
  // refund and the job terminal state can never diverge. Stock is returned
  // through releaseReservationTx, the sole owner of the reservedQuantity
  // counter; its ACTIVE guard makes a concurrent worker release or a real
  // delivery win instead of double-releasing stock or double-refunding.
  async reclaim(candidate: ExpiredReservationCandidate, now: Date): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const released = await releaseReservationTx(tx, candidate.reservationId, 'EXPIRED', now);
      if (!released) return false;

      await refundReservationTx(tx, candidate.reservationId, this.wallets);

      if (candidate.jobId) {
        await tx.external_jobs.updateMany({
          where: { id: candidate.jobId, siteId: candidate.siteId, status: 'QUEUED', attempt: 0 },
          data: {
            status: 'FAILED',
            completedAt: now,
            lastErrorCode: 'STOCK_RESERVATION_EXPIRED',
            lastErrorDetail: { reason: 'stock_reservation_expired_before_execution' },
          },
        });
      }
      return true;
    });
  }
}
