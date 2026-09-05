import { Injectable } from '@nestjs/common';
import { prisma } from '@ipeasy/db';
import { Prisma } from '@ipeasy/db/generated/client';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { assertLeaseCompletion } from '../external-work/domain';

export const BARK_INVENTORY_LOW_TOPIC = 'alerts.bark.inventory_low';

export const BARK_ALERT_TOPICS = [BARK_INVENTORY_LOW_TOPIC] as const;

export type BarkAlertEvent = Prisma.outbox_eventsGetPayload<Record<string, never>>;

@Injectable()
export class BarkAlertOutboxRepository {
  async findQueued(limit = 20): Promise<Array<Pick<BarkAlertEvent, 'id'>>> {
    const now = new Date();
    return prisma.outbox_events.findMany({
      where: {
        topic: { in: [...BARK_ALERT_TOPICS] },
        status: { in: ['PENDING', 'RETRYING'] },
        nextRunAt: { lte: now },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
      select: { id: true },
    });
  }

  async claimRunnableEvent(eventId: string, workerId: string, leaseMs = 60_000): Promise<BarkAlertEvent | null> {
    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.outbox_events.updateMany({
        where: {
          id: eventId,
          topic: { in: [...BARK_ALERT_TOPICS] },
          status: { in: ['PENDING', 'RETRYING'] },
          nextRunAt: { lte: now },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        data: {
          status: 'LEASED',
          attempt: { increment: 1 },
          leaseOwner: workerId,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
        },
      });
      if (claimed.count !== 1) return null;
      return tx.outbox_events.findUniqueOrThrow({ where: { id: eventId } });
    });
  }

  async recoverExpiredLeases(): Promise<number> {
    // A lease expires after the event was claimed, so the Bark push may already have
    // reached the admin devices. Retrying would duplicate the alert, so transmission
    // ambiguity goes to operator review instead of back into the queue.
    const recovered = await prisma.outbox_events.updateMany({
      where: {
        topic: { in: [...BARK_ALERT_TOPICS] },
        status: 'LEASED',
        leaseExpiresAt: { lt: new Date() },
      },
      data: {
        status: 'NEEDS_OPERATOR',
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: 'BARK_DELIVERY_LEASE_EXPIRED',
        lastErrorDetail: { reasonKey: 'bark_delivery_lease_expired' },
      },
    });
    return recovered.count;
  }

  async markPublished(event: BarkAlertEvent, workerId: string): Promise<void> {
    const now = new Date();
    const updated = await prisma.outbox_events.updateMany({
      where: activeLeaseWhere(event, workerId, now),
      data: {
        status: 'PUBLISHED',
        publishedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        lastErrorDetail: Prisma.JsonNull,
      },
    });
    if (updated.count !== 1) staleBarkAlertLease();
  }

  async releaseClaimed(event: BarkAlertEvent, workerId: string): Promise<void> {
    const now = new Date();
    const updated = await prisma.outbox_events.updateMany({
      where: activeLeaseWhere(event, workerId, now),
      data: {
        status: 'PENDING',
        attempt: { decrement: 1 },
        nextRunAt: new Date(now.getTime() + 5_000),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (updated.count !== 1) staleBarkAlertLease();
  }

  async markFailed(
    event: BarkAlertEvent,
    workerId: string,
    code: string,
    detail: Record<string, unknown>,
    options: { retry: boolean },
  ): Promise<'RETRYING' | 'FAILED' | 'NEEDS_OPERATOR'> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.outbox_events.findUnique({ where: { id: event.id } });
      if (!current) throw new AppError(ErrorCode.NOT_FOUND, 'bark_alert_event_not_found', 404);
      assertLeaseCompletion(current, {
        workerId,
        desiredVersion: event.desiredVersion,
        now: new Date(),
        onStale: staleBarkAlertLease,
      });
      const status = options.retry
        ? (current.attempt >= current.maxAttempts ? 'FAILED' : 'RETRYING')
        : 'NEEDS_OPERATOR';
      const now = new Date();
      const updated = await tx.outbox_events.updateMany({
        where: activeLeaseWhere(current, workerId, now),
        data: {
          status,
          nextRunAt: status === 'RETRYING' ? new Date(now.getTime() + retryDelayMs(current.attempt)) : current.nextRunAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: code,
          lastErrorDetail: detail as Prisma.InputJsonObject,
        },
      });
      if (updated.count !== 1) staleBarkAlertLease();
      return status;
    });
  }
}

function activeLeaseWhere(
  event: Pick<BarkAlertEvent, 'id' | 'desiredVersion'>,
  workerId: string,
  now: Date,
) {
  return {
    id: event.id,
    desiredVersion: event.desiredVersion,
    status: 'LEASED' as const,
    leaseOwner: workerId,
    leaseExpiresAt: { gt: now },
  };
}

function staleBarkAlertLease(): never {
  throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'bark_alert_lease_stale', 409);
}

function retryDelayMs(attempt: number): number {
  return Math.min(60_000, Math.max(1_000, 2 ** Math.min(attempt, 6) * 1_000));
}
